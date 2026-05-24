import { loadConfig } from "./config.js";
import { fetchArticles } from "./feed.js";
import { Storage } from "./storage.js";
import { BlueskyClient } from "./bluesky.js";
import { sleep, formatDuration } from "./utils.js";

const args = process.argv.slice(2);

/**
 * Parse a --key=value argument from CLI args.
 */
function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

/**
 * Seed mode: marks current articles as already-posted without actually
 * posting them. Use --leave=N to skip the N most recent articles so
 * they get picked up on the first real run (useful for testing).
 *
 * Examples:
 *   npm run seed                # seed all articles
 *   npm run seed -- --leave=3   # seed all except the 3 most recent
 */
async function seed(): Promise<void> {
  const leaveCount = parseInt(getArg("leave") || "0", 10);

  console.log("[seed] Seeding database with existing articles...");
  if (leaveCount > 0) {
    console.log(
      `[seed] Leaving the ${leaveCount} most recent article(s) unseeded for testing`
    );
  }

  const config = loadConfig();
  const storage = new Storage(config.dbPath);

  // Articles come sorted oldest-first from fetchArticles
  const articles = await fetchArticles(config.feedUrl, config.mecEventsUrl);

  // Determine how many to seed (all except the last `leaveCount`)
  const toSeed = leaveCount > 0
    ? articles.slice(0, articles.length - leaveCount)
    : articles;
  const left = leaveCount > 0
    ? articles.slice(articles.length - leaveCount)
    : [];

  let seeded = 0;
  for (const article of toSeed) {
    if (!storage.isPosted(article.link)) {
      storage.markPosted(article.link, article.title, article.feedTitle);
      seeded++;
    }
  }

  let unseeded = 0;
  for (const article of left) {
    if (storage.isPosted(article.link)) {
      storage.unmarkPosted(article.link);
      unseeded++;
    }
  }

  console.log(
    `[seed] Marked ${seeded} articles as posted (${toSeed.length - seeded} already in DB)`
  );
  if (unseeded > 0) {
    console.log(
      `[seed] Removed ${unseeded} 'left' article(s) from database to ensure they are unseeded`
    );
  }
  console.log(`[seed] Total articles in database: ${storage.getCount()}`);

  if (left.length > 0) {
    console.log(`\n[seed] Articles left for first run (${left.length}):`);
    for (const a of left) {
      console.log(`  • ${a.title}`);
      console.log(`    ${a.link}`);
      console.log(`    ${a.feedTitle} — ${a.pubDate}\n`);
    }
    console.log(
      "[seed] Run 'npm start' next to post these and test the catch-up delay."
    );
  }

  storage.close();
}

/**
 * Show recently posted articles from the database.
 */
function showRecent(): void {
  const config = loadConfig();
  const storage = new Storage(config.dbPath);

  const recent = storage.getRecent(20);
  console.log(`\nLast ${recent.length} posted articles:\n`);
  for (const r of recent) {
    console.log(`  ${r.posted_at}  ${r.feed_title}`);
    console.log(`    ${r.title}`);
    console.log(`    ${r.link}\n`);
  }
  console.log(`Total in database: ${storage.getCount()}`);
  storage.close();
}

/**
 * Single posting run: fetch → filter → post new articles.
 * Returns true if at least one article was posted.
 */
async function run(): Promise<boolean> {
  const startTime = Date.now();

  console.log("=".repeat(60));
  console.log(
    `[main] Tezos News Bot run at ${new Date().toISOString()}`
  );
  console.log("=".repeat(60));

  // 1. Load configuration
  const config = loadConfig();
  console.log(`[main] Feed URL: ${config.feedUrl}`);
  if (config.mecEventsUrl) {
    console.log(`[main] MEC Events URL: ${config.mecEventsUrl}`);
  }
  console.log(`[main] Dry run: ${config.dryRun}`);
  console.log(
    `[main] Catch-up interval: ${formatDuration(config.catchupIntervalMs)}`
  );

  // 2. Initialize storage
  const storage = new Storage(config.dbPath);
  console.log(`[main] Previously posted articles: ${storage.getCount()}`);

  // 3. Login to Bluesky (skip in dry-run mode)
  const bsky = new BlueskyClient(config);

  if (!config.dryRun) {
    try {
      await bsky.login();
    } catch (err) {
      console.error("[main] Failed to login to Bluesky:", err);
      storage.close();
      throw err;
    }
  } else {
    console.log("[main] Dry-run mode — skipping Bluesky login");
  }

  // 4. Fetch articles from the API
  let articles;
  try {
    articles = await fetchArticles(config.feedUrl, config.mecEventsUrl);
  } catch (err) {
    console.error("[main] Failed to fetch articles:", err);
    storage.close();
    throw err;
  }

  // 5. Filter out already-posted articles and those that are too old
  const now = new Date();
  const maxAgeMs = config.maxArticleAgeDays * 24 * 60 * 60 * 1000;
  let skippedCount = 0;

  const newArticles = articles.filter((a) => {
    if (storage.isPosted(a.link)) {
      return false;
    }

    const ageMs = now.getTime() - a.parsedDate.getTime();
    if (ageMs > maxAgeMs) {
      console.log(
        `[main] Skipping old article: "${a.title}" (published ${a.pubDate})`
      );
      if (!config.dryRun) {
        storage.markPosted(a.link, a.title, a.feedTitle);
      }
      skippedCount++;
      return false;
    }

    return true;
  });

  if (skippedCount > 0) {
    console.log(
      `[main] Skipped and cached ${skippedCount} old article(s) older than ${config.maxArticleAgeDays} days`
    );
  }

  console.log(
    `[main] ${newArticles.length} new article(s) to post (out of ${articles.length} total)`
  );

  if (newArticles.length === 0) {
    console.log("[main] Nothing new to post.");
    storage.close();
    return false;
  }

  // 6. Post each new article (oldest first)
  let posted = 0;
  let failed = 0;

  for (let i = 0; i < newArticles.length; i++) {
    const article = newArticles[i];
    console.log(
      `\n[main] Posting ${i + 1}/${newArticles.length}: "${article.title}"`
    );

    try {
      await bsky.postArticle(article);

      // Mark as posted in the database
      if (!config.dryRun) {
        storage.markPosted(article.link, article.title, article.feedTitle);
      }
      posted++;

      // If there are more articles to post, wait before the next one
      if (i < newArticles.length - 1) {
        console.log(
          `[main] Waiting ${formatDuration(config.catchupIntervalMs)} before next post...`
        );
        await sleep(config.catchupIntervalMs);
      }
    } catch (err) {
      console.error(
        `[main] Failed to post "${article.title}":`,
        err
      );
      failed++;

      // On error, still wait before trying the next one
      if (i < newArticles.length - 1) {
        const errorDelay = Math.min(config.catchupIntervalMs, 30_000);
        console.log(
          `[main] Waiting ${formatDuration(errorDelay)} after error before retry...`
        );
        await sleep(errorDelay);
      }
    }
  }

  // 7. Summary
  const elapsed = Date.now() - startTime;
  console.log("\n" + "=".repeat(60));
  console.log(`[main] Run complete in ${formatDuration(elapsed)}`);
  console.log(`[main] Posted: ${posted}, Failed: ${failed}, Skipped (existing): ${articles.length - newArticles.length}`);
  console.log(
    `[main] Total articles in database: ${storage.getCount()}`
  );
  console.log("=".repeat(60));

  storage.close();
  return posted > 0;
}

/**
 * Daemon mode: run in a loop, polling every CHECK_INTERVAL.
 * Designed for PM2 or any process manager that keeps it alive.
 */
async function daemon(): Promise<void> {
  const config = loadConfig();
  const checkIntervalMs = parseInt(
    process.env.CHECK_INTERVAL_MS || "1800000",
    10
  ); // default 30 min

  console.log("[daemon] Starting in daemon mode");
  console.log(
    `[daemon] Check interval: ${formatDuration(checkIntervalMs)}`
  );
  console.log("[daemon] Press Ctrl+C to stop\n");

  // Handle graceful shutdown
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log("\n[daemon] Shutting down gracefully...");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (!stopping) {
    try {
      await run();
    } catch (err) {
      console.error("[daemon] Run failed:", err);
      console.log("[daemon] Will retry at next interval.");
    }

    if (!stopping) {
      console.log(
        `\n[daemon] Next check in ${formatDuration(checkIntervalMs)}...\n`
      );
      await sleep(checkIntervalMs);
    }
  }
}

// ─── CLI dispatch ───────────────────────────────────────────

if (args.includes("--seed")) {
  seed().catch((err) => {
    console.error("[seed] Unhandled error:", err);
    process.exit(1);
  });
} else if (args.includes("--recent")) {
  showRecent();
} else if (args.includes("--daemon")) {
  daemon().catch((err) => {
    console.error("[daemon] Unhandled error:", err);
    process.exit(1);
  });
} else {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[main] Unhandled error:", err);
      process.exit(1);
    });
}
