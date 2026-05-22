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

/**
 * Parse a date string that could be RFC 2822 or ISO 8601.
 * Both formats are used by the TezLens API.
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
 * Returns articles sorted oldest-first and deduplicated by link URL.
 */
export async function fetchArticles(feedUrl: string): Promise<Article[]> {
  console.log(`[feed] Fetching articles from ${feedUrl}`);

  const response = await fetch(feedUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TezosNewsBskyBot/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `[feed] API request failed: ${response.status} ${response.statusText}`
    );
  }

  const raw: RawArticle[] = await response.json() as RawArticle[];
  console.log(`[feed] Received ${raw.length} raw articles`);

  // Deduplicate by link URL (keep the first occurrence)
  const seen = new Set<string>();
  const unique: Article[] = [];

  for (const item of raw) {
    if (!item.link || seen.has(item.link)) {
      continue;
    }
    seen.add(item.link);

    unique.push({
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

  // Sort oldest first so we post in chronological order
  unique.sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

  console.log(`[feed] ${unique.length} unique articles after dedup`);
  return unique;
}
