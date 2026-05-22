import { load as cheerioLoad } from "cheerio";

/**
 * Extract a plain-text description from HTML content.
 * Takes the first meaningful paragraph and truncates to maxLen.
 */
export function extractDescription(html: string, maxLen: number = 280): string {
  if (!html || html.trim().length === 0) {
    return "";
  }

  try {
    const $ = cheerioLoad(html);

    // Remove script and style tags
    $("script, style").remove();

    // Try to get the first paragraph with real content
    const paragraphs = $("p, blockquote, h1, h2, h3, h4, li");
    for (let i = 0; i < paragraphs.length; i++) {
      const text = $(paragraphs[i]).text().trim();
      // Skip very short fragments (nav items, labels, etc.)
      if (text.length > 30) {
        return truncate(text, maxLen);
      }
    }

    // Fallback: get all text content
    const allText = $.text().trim();
    if (allText.length > 0) {
      return truncate(allText, maxLen);
    }
  } catch {
    // If HTML parsing fails, try a simple regex strip
    const stripped = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped.length > 0) {
      return truncate(stripped, maxLen);
    }
  }

  return "";
}

/**
 * Truncate text to maxLen, breaking at the last word boundary, with ellipsis.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  const truncated = text.substring(0, maxLen - 1);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.5) {
    return truncated.substring(0, lastSpace) + "…";
  }
  return truncated + "…";
}

/**
 * Download an image from a URL and return the raw bytes + MIME type.
 * Returns null if the download fails or the URL is invalid.
 */
export async function downloadImage(
  url: string
): Promise<{ data: Uint8Array; mimeType: string } | null> {
  if (!url || url.trim().length === 0) {
    return null;
  }

  try {
    // Handle YouTube video thumbnail URLs
    // YouTube RSS uses format: https://www.youtube.com/v/VIDEO_ID?version=3
    const ytMatch = url.match(
      /youtube\.com\/v\/([^?&]+)/
    );
    if (ytMatch) {
      url = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
    }

    // Handle Medium CDN image URLs (cdn-images-1.medium.com / cdn-images-2.medium.com etc.)
    // Medium RSS uses format: https://cdn-images-1.medium.com/max/1024/1*HAGZNvOE_BeKAhrufsqOKg.png
    // We rewrite the max width to 600px to ensure the file size remains well under 1MB
    if (url.includes("cdn-images-") && url.includes(".medium.com/max/")) {
      url = url.replace(/\/max\/\d+\//, "/max/600/");
    }

    console.log(`[utils] Downloading image: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "TezosNewsBskyBot/1.0",
      },
    });

    if (!response.ok) {
      console.warn(
        `[utils] Image download failed: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const mimeType = contentType.split(";")[0].trim();

    // Only accept raster image types, reject SVG since Bluesky requires PNG/JPEG
    if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") {
      console.warn(`[utils] Unsupported or SVG image content type: ${mimeType}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Bluesky has a 1MB limit for blobs
    if (data.byteLength > 1_000_000) {
      console.warn(
        `[utils] Image too large (${(data.byteLength / 1024 / 1024).toFixed(1)}MB), skipping thumbnail`
      );
      return null;
    }

    console.log(
      `[utils] Downloaded image: ${(data.byteLength / 1024).toFixed(0)}KB (${mimeType})`
    );
    return { data, mimeType };
  } catch (err) {
    console.warn(`[utils] Image download error:`, err);
    return null;
  }
}

/**
 * Promisified sleep.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}
