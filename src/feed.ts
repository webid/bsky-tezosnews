import { decodeHtmlEntities } from "./utils.js";

export interface Article {
  title: string;
  link: string;
  content: string;
  image: string;
  pubDate: string;
  feedId: string;
  feedTitle: string;
  /** Parsed date for sorting/comparison */
  parsedDate: Date;
}

interface RawArticle {
  title: string;
  link: string;
  content: string;
  image: string;
  pubDate: string;
  feedId: string;
  feedTitle: string;
}

interface WordPressMecEvent {
  id: number;
  date: string;
  date_gmt: string;
  link: string;
  title: {
    rendered: string;
  };
  content?: {
    rendered: string;
  };
  excerpt?: {
    rendered: string;
  };
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      source_url: string;
    }>;
  };
}

/**
 * Parse a date string that could be RFC 2822 or ISO 8601.
 * Both formats are used by the TezLens API and WordPress.
 */
function parsePubDate(dateStr: string): Date {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    console.warn(`[feed] Could not parse date: "${dateStr}", using current time`);
    return new Date();
  }
  return d;
}

/**
 * Fetch articles from the TezLens API.
 */
async function fetchTezLensArticles(feedUrl: string): Promise<Article[]> {
  console.log(`[feed] Fetching articles from TezLens: ${feedUrl}`);

  const response = await fetch(feedUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TezosNewsBskyBot/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `[feed] TezLens API request failed: ${response.status} ${response.statusText}`
    );
  }

  const raw: RawArticle[] = await response.json() as RawArticle[];
  console.log(`[feed] Received ${raw.length} raw articles from TezLens`);

  const articles: Article[] = [];
  for (const item of raw) {
    if (!item.link) continue;

    articles.push({
      title: item.title || "(Untitled)",
      link: item.link,
      content: item.content || "",
      image: item.image || "",
      pubDate: item.pubDate || "",
      feedId: item.feedId || "",
      feedTitle: item.feedTitle || "",
      parsedDate: parsePubDate(item.pubDate),
    });
  }

  return articles;
}

/**
 * Fetch events from WordPress REST API (MEC plugin).
 */
async function fetchMecEvents(mecEventsUrl: string): Promise<Article[]> {
  console.log(`[feed] Fetching MEC events from WordPress: ${mecEventsUrl}`);

  // We want to fetch with _embed to get the featured media
  const separator = mecEventsUrl.includes("?") ? "&" : "?";
  const url = `${mecEventsUrl}${separator}_embed`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TezosNewsBskyBot/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `[feed] WordPress MEC events API failed: ${response.status} ${response.statusText}`
    );
  }

  const raw = await response.json() as WordPressMecEvent[];
  console.log(`[feed] Received ${raw.length} raw MEC events from WordPress`);

  const articles: Article[] = [];
  for (const item of raw) {
    if (!item.link) continue;

    // Decode HTML entities in title (e.g. &#8217; -> ’)
    const title = decodeHtmlEntities(item.title?.rendered || "(Untitled Event)");

    // Extract featured image from embedded attachment
    let image = "";
    const media = item._embedded?.["wp:featuredmedia"];
    if (media && Array.isArray(media) && media.length > 0) {
      image = media[0].source_url || "";
    }

    const content = item.content?.rendered || item.excerpt?.rendered || "";
    const pubDate = item.date || item.date_gmt || new Date().toISOString();

    articles.push({
      title,
      link: item.link,
      content,
      image,
      pubDate,
      feedId: "wordpress-events",
      feedTitle: "Tezos Events Calendar", // Shows as 'via TTC's Tezos Events Calendar' on Bluesky
      parsedDate: parsePubDate(pubDate),
    });
  }

  return articles;
}

/**
 * Fetch articles/events from configured sources, merge, and deduplicate by link URL.
 * Returns items sorted oldest-first.
 */
export async function fetchArticles(feedUrl: string, mecEventsUrl?: string): Promise<Article[]> {
  const fetchers = [
    fetchTezLensArticles(feedUrl).catch((err) => {
      console.error("[feed] Failed to fetch TezLens articles:", err);
      return [] as Article[];
    }),
  ];

  if (mecEventsUrl) {
    fetchers.push(
      fetchMecEvents(mecEventsUrl).catch((err) => {
        console.error("[feed] Failed to fetch WordPress MEC events:", err);
        return [] as Article[];
      })
    );
  }

  const results = await Promise.all(fetchers);
  const combined = results.flat();

  // Deduplicate by link URL (keep the first occurrence)
  const seen = new Set<string>();
  const unique: Article[] = [];

  for (const item of combined) {
    if (!item.link || seen.has(item.link)) {
      continue;
    }
    seen.add(item.link);
    unique.push(item);
  }

  // Sort oldest first so we post in chronological order
  unique.sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

  console.log(`[feed] ${unique.length} unique articles/events total after combining and deduping`);
  return unique;
}

