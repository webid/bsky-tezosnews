import "dotenv/config";

export interface Config {
  bskyHandle: string;
  bskyAppPassword: string;
  feedUrl: string;
  mecEventsUrl?: string;
  catchupIntervalMs: number;
  dbPath: string;
  dryRun: boolean;
  sessionPath: string;
  maxArticleAgeDays: number;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadConfig(): Config {
  const dbPath = process.env.DB_PATH || "./data/posted.db";
  // Derive session path from DB directory
  const dataDir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  const sessionPath = `${dataDir}/session.json`;

  return {
    bskyHandle: requireEnv("BSKY_HANDLE"),
    bskyAppPassword: requireEnv("BSKY_APP_PASSWORD"),
    feedUrl:
      process.env.FEED_URL ||
      "https://tezlens.purplematter.com/api/articles",
    mecEventsUrl: process.env.MEC_EVENTS_URL,
    catchupIntervalMs: parseInt(process.env.CATCHUP_INTERVAL_MS || "300000", 10),
    dbPath,
    dryRun: process.env.DRY_RUN === "true",
    sessionPath,
    maxArticleAgeDays: parseInt(process.env.MAX_ARTICLE_AGE_DAYS || "7", 10),
  };
}
