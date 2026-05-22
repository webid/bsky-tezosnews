# Tezos News Bluesky Bot

A bot that automatically posts Tezos ecosystem news from [TezLens](https://purplematter.com/tezlens) to [Bluesky](https://bsky.app).

## Features

- 📰 **Rich embeds** — Posts with link cards including thumbnail, title, and description
- 🔄 **Smart polling** — Checks for new articles every 30 minutes
- ⏩ **Catch-up mode** — When multiple new articles appear, posts one every 5 minutes until caught up
- 🗃️ **Deduplication** — SQLite-backed tracking prevents duplicate posts
- 🔐 **Session persistence** — Saves Bluesky auth session to avoid unnecessary re-logins
- 🧪 **Dry-run mode** — Test without actually posting to Bluesky
- #️⃣ **Hashtags** — Auto-detected `#Tezos` and `#TezosNews` facets

## Quick Start (Local)

### 1. Prerequisites

- Node.js 20+ ([install](https://nodejs.org/))
- A Bluesky account with an App Password

### 2. Install

```bash
git clone <repo-url>
cd bsky-tezosnews
npm install
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env with your Bluesky handle and App Password
```

### 4. Test (dry run)

```bash
npm run dry-run
```

### 5. Run for real

```bash
npm start
```

## Bluesky Account Setup

1. **Create account** at [bsky.app](https://bsky.app) (e.g. `tezosnews.bsky.social`)
2. **Set profile**:
   - Display name: `Tezos News`
   - Bio: `🤖 Automated bot · Tezos ecosystem news from TezLens · purplematter.com/tezlens`
3. **Generate App Password**:
   - Settings → Advanced → App Passwords → Add App Password
   - Name it `tezosnews-bot`
   - Copy the password into your `.env` file

## VPS Deployment (Ubuntu)

### Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Deploy the bot

```bash
# Clone and install
sudo git clone <repo-url> /opt/bsky-tezosnews
cd /opt/bsky-tezosnews
sudo npm ci --production

# Create data directory and set permissions
sudo mkdir -p data
sudo chown -R www-data:www-data /opt/bsky-tezosnews

# Configure secrets
sudo cp .env.example .env
sudo nano .env  # Fill in your credentials
sudo chmod 600 .env
sudo chown www-data:www-data .env
```

### 3. Initialize Database (First Run / Seeding)

Since the TezLens API returns a full history of articles (400+), running the bot without seeding would cause it to post every historical article one by one. You must seed the database first.

*   **Standard Seed** (marks all existing articles as posted):
    ```bash
    npm run seed
    ```

*   **Testing Seed** (marks all except the **last 3** articles as posted):
    This is highly recommended for testing the posting flow and the 5-minute catch-up delay on your first run.
    ```bash
    npm run seed:test
    ```

---

### Option A: PM2 Deployment (Daemon Mode)

If your environment uses **PM2** to manage processes and bots, you can run the bot in continuous daemon mode. It will loop internally, checking the feed every 30 minutes (or custom interval).

1. **Install PM2 globally** (if not already installed):
   ```bash
   sudo npm install -g pm2
   ```

2. **Start the bot**:
   ```bash
   pm2 start ecosystem.config.cjs
   ```
   *Note: This automatically runs the bot in `--daemon` mode, loads `.env` for credentials, and outputs logs to the `./logs` directory.*

3. **Manage & monitor**:
   ```bash
   # View status
   pm2 status tezosnews-bot

   # Monitor logs in real-time
   pm2 logs tezosnews-bot

   # Restart the bot
   pm2 restart tezosnews-bot

   # Stop the bot
   pm2 stop tezosnews-bot
   ```

4. **Persist across server reboots**:
   ```bash
   pm2 startup
   # (Run the command generated in the terminal output)
   pm2 save
   ```

---

### Option B: Systemd Timer (Oneshot Cron)

Alternatively, you can schedule the bot to run every 30 minutes using a systemd timer, running as a standard oneshot command.

1. **Install systemd timer & service files**:
   ```bash
   sudo cp deploy/tezosnews-bot.service /etc/systemd/system/
   sudo cp deploy/tezosnews-bot.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now tezosnews-bot.timer
   ```

2. **Verify & Manage**:
   ```bash
   # Check timer status
   sudo systemctl status tezosnews-bot.timer

   # Run a check manually now
   sudo systemctl start tezosnews-bot.service

   # View systemd logs
   sudo journalctl -u tezosnews-bot.service -f

   # List all active timers
   systemctl list-timers --all | grep tezosnews
   ```

## Configuration

| Variable | Default | Description |
|:---|:---|:---|
| `BSKY_HANDLE` | *(required)* | Bluesky handle |
| `BSKY_APP_PASSWORD` | *(required)* | Bluesky App Password |
| `FEED_URL` | `https://tezlens.purplematter.com/api/articles` | TezLens API endpoint |
| `CHECK_INTERVAL_MS` | `1800000` (30 min) | Frequency of feed checks (Daemon mode only) |
| `CATCHUP_INTERVAL_MS` | `300000` (5 min) | Delay between posts when catching up |
| `DB_PATH` | `./data/posted.db` | SQLite database path |
| `DRY_RUN` | `false` | Log posts without sending |

## Architecture

```
PM2 / Daemon Mode                 OR        Systemd Timer (30 min)
  └── loop every 30 min                         └── main.ts (oneshot run)
        │                                              │
        └───────────────────────┬──────────────────────┘
                                ▼
                       main.ts (orchestrator)
                         → feed.ts: fetch & parse TezLens API
                         → storage.ts: check SQLite for already-posted
                         → bluesky.ts: post with external embed card
                         → sleep 5 min if more articles
                         → exit (if not daemon)
```

## Handy Recipes & Tips

### 🧪 Resetting the Database for Testing
If you want to re-run your first-post catch-up testing (leaving the last 3 articles unseeded so the bot posts them with a 5-minute delay), the SQLite database must be completely empty first since SQLite is persistent.

Run this sequence:
```bash
# 1. Delete the SQLite database file
rm -f data/posted.db

# 2. Seed the database, leaving the 3 most recent articles unseeded
npm run seed:test

# 3. Test in dry-run mode (logs mock posts to console without sending)
npm run dry-run

# 4. Or run for real to post the 3 articles to Bluesky
npm start
```

### ⚡ Speed Up Dry-Run Delays
If you want to verify the catch-up flow during a dry run without waiting 5 minutes between each console print, override the `CATCHUP_INTERVAL_MS` environment variable inline:
```bash
CATCHUP_INTERVAL_MS=1000 npm run dry-run
```

### 🖼️ Automatic Image Optimization & Fallbacks
Bluesky has a strict **1.0MB size limit** for post thumbnail blobs. To ensure posts always look stunning and never fail due to large images:
*   **Medium CDN Images**: The bot automatically detects Medium CDN URLs and rewrites the width parameter from `/max/1024/` down to `/max/600/`, reducing the size of high-res PNGs from ~1.2MB down to under 400KB while retaining excellent mobile/desktop visual fidelity.
*   **Unsupported & SVG Formats**: Vector SVGs are not supported by Bluesky. The bot automatically filters these out.
*   **Tezos Logo Fallback**: If an article's custom image is too large, fails to download, or is an unsupported format, the bot automatically falls back to downloading and uploading the default Tezos logo (`https://purplematter.com/img/tezos.png`). This guarantees every post always features a gorgeous preview card!

## License

MIT
