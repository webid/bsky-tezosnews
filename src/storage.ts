import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class Storage {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure the data directory exists
    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent access
    this.db.pragma("journal_mode = WAL");

    // Create the table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS posted_articles (
        link TEXT PRIMARY KEY,
        title TEXT,
        feed_title TEXT,
        posted_at TEXT DEFAULT (datetime('now'))
      )
    `);

    console.log(`[storage] Database initialized at ${dbPath}`);
  }

  /**
   * Check whether an article has already been posted.
   */
  isPosted(link: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM posted_articles WHERE link = ?")
      .get(link);
    return row !== undefined;
  }

  /**
   * Record an article as successfully posted.
   */
  markPosted(link: string, title: string, feedTitle: string): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO posted_articles (link, title, feed_title) VALUES (?, ?, ?)"
      )
      .run(link, title, feedTitle);
  }

  /**
   * Get the N most recently posted articles (for debugging).
   */
  getRecent(n: number = 10): Array<{
    link: string;
    title: string;
    feed_title: string;
    posted_at: string;
  }> {
    return this.db
      .prepare(
        "SELECT link, title, feed_title, posted_at FROM posted_articles ORDER BY posted_at DESC LIMIT ?"
      )
      .all(n) as Array<{
      link: string;
      title: string;
      feed_title: string;
      posted_at: string;
    }>;
  }

  /**
   * Get total count of posted articles.
   */
  getCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM posted_articles")
      .get() as { count: number };
    return row.count;
  }

  close(): void {
    this.db.close();
  }
}
