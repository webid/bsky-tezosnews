import { AtpAgent, RichText, type BlobRef } from "@atproto/api";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Config } from "./config.js";
import type { Article } from "./feed.js";
import { extractDescription, downloadImage } from "./utils.js";

// Mapping from feed titles to official Bluesky handles.
// Add more official handles here as you discover them!
const FEED_BLUESKY_HANDLES: Record<string, string> = {
  "Tezos Commons": "@tezoscommons.org",
  // Add more as discovered:
  // "Nomadic Labs R&D": "@nomadiclabs.tetaneutral.net",
  // "Etherlink": "@etherlink.bsky.social",
};

export class BlueskyClient {
  private agent: AtpAgent;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.agent = new AtpAgent({ service: "https://bsky.social" });
  }

  /**
   * Login to Bluesky, resuming a saved session if available.
   */
  async login(): Promise<void> {
    // Try to resume a saved session first
    if (existsSync(this.config.sessionPath)) {
      try {
        const saved = JSON.parse(
          readFileSync(this.config.sessionPath, "utf-8")
        );
        await this.agent.resumeSession(saved);
        console.log(
          `[bsky] Resumed session for ${this.agent.session?.handle}`
        );
        return;
      } catch (err) {
        console.warn("[bsky] Failed to resume session, logging in fresh:", err);
      }
    }

    // Fresh login
    const response = await this.agent.login({
      identifier: this.config.bskyHandle,
      password: this.config.bskyAppPassword,
    });

    console.log(`[bsky] Logged in as ${response.data.handle}`);

    // Save session for next run
    this.saveSession();
  }

  /**
   * Persist the current session to disk.
   */
  private saveSession(): void {
    if (this.agent.session) {
      try {
        writeFileSync(
          this.config.sessionPath,
          JSON.stringify(this.agent.session, null, 2),
          { mode: 0o600 }
        );
        console.log("[bsky] Session saved");
      } catch (err) {
        console.warn("[bsky] Failed to save session:", err);
      }
    }
  }

  /**
   * Post an article to Bluesky with a rich external embed card.
   */
  async postArticle(article: Article): Promise<void> {
    // Build post text
    const postText = this.buildPostText(article);

    // Build rich text with auto-detected facets (hashtags, links, mentions)
    const rt = new RichText({ text: postText });
    try {
      await rt.detectFacets(this.agent);
    } catch (err) {
      console.warn("[bsky] Failed to detect facets automatically:", err);
    }

    // Build the external embed (link card with thumbnail)
    const embed = await this.buildEmbed(article);

    if (this.config.dryRun) {
      console.log("\n[bsky] ── DRY RUN ──────────────────────────────");
      console.log(`[bsky] Text: ${postText}`);
      console.log(`[bsky] Embed URI: ${article.link}`);
      console.log(`[bsky] Embed title: ${article.title}`);
      console.log(
        `[bsky] Embed desc: ${extractDescription(article.content, 100)}...`
      );
      console.log(`[bsky] Has thumbnail: ${embed?.external?.thumb ? "yes" : "no"}`);
      console.log("[bsky] ─────────────────────────────────────────\n");
      return;
    }

    // Post to Bluesky
    const response = await this.agent.post({
      text: rt.text,
      facets: rt.facets,
      embed: embed || undefined,
      createdAt: new Date().toISOString(),
    });

    console.log(`[bsky] Posted: "${article.title}" → ${response.uri}`);

    // Refresh session after posting
    this.saveSession();
  }

  /**
   * Build the post text for an article.
   */
  private buildPostText(article: Article): string {
    const parts: string[] = [];
    const viaSource = FEED_BLUESKY_HANDLES[article.feedTitle] || article.feedTitle;

    parts.push(`📰 ${article.title}`);
    parts.push("");
    parts.push(`via ${viaSource}`);
    parts.push("");
    parts.push("#Tezos");

    const text = parts.join("\n");

    // Bluesky has a 300-character limit (measured in graphemes)
    // The embed card carries the URL, so we don't need to include it in the text
    if (text.length > 300) {
      // Truncate the title to fit
      const maxTitleLen = 300 - `📰 \n\nvia ${viaSource}\n\n#Tezos`.length;
      const truncatedTitle =
        article.title.substring(0, maxTitleLen - 1) + "…";
      return `📰 ${truncatedTitle}\n\nvia ${viaSource}\n\n#Tezos`;
    }

    return text;
  }

  /**
   * Build an external embed (link card) for the article.
   * Downloads and uploads the thumbnail if available.
   */
  private async buildEmbed(article: Article): Promise<{
    $type: "app.bsky.embed.external";
    external: {
      uri: string;
      title: string;
      description: string;
      thumb?: BlobRef;
    };
  } | null> {
    const description = extractDescription(article.content);

    // Try to download and upload the thumbnail
    let thumbBlob: BlobRef | undefined;
    if (article.image) {
      let imageData = await downloadImage(article.image);

      // Fallback: If custom image download failed, was SVG, or was skipped due to size,
      // fall back to using the default Tezos logo so the post still gets a beautiful preview.
      if (!imageData && article.image !== "https://purplematter.com/img/tezos.png") {
        console.log(`[bsky] Falling back to default Tezos logo for thumbnail`);
        imageData = await downloadImage("https://purplematter.com/img/tezos.png");
      }

      if (imageData) {
        if (!this.config.dryRun) {
          try {
            const uploadResult = await this.agent.uploadBlob(imageData.data, {
              encoding: imageData.mimeType,
            });
            thumbBlob = uploadResult.data.blob;
            console.log(`[bsky] Uploaded thumbnail for "${article.title}"`);
          } catch (err) {
            console.warn(`[bsky] Failed to upload thumbnail:`, err);
          }
        } else {
          // Provide a mock blob for dry-run output representation
          thumbBlob = { $type: "blob", ref: { $link: "mock-link" } } as any;
        }
      }
    }

    return {
      $type: "app.bsky.embed.external",
      external: {
        uri: article.link,
        title: article.title,
        description: description || article.feedTitle,
        ...(thumbBlob ? { thumb: thumbBlob } : {}),
      },
    };
  }
}
