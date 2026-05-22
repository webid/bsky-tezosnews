// PM2 ecosystem configuration for the Tezos News Bluesky Bot.
// Usage:
//   pm2 start ecosystem.config.cjs
//   pm2 logs tezosnews-bot
//   pm2 stop tezosnews-bot
//   pm2 restart tezosnews-bot

module.exports = {
  apps: [
    {
      name: "tezosnews-bot",
      script: "src/main.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      args: "--daemon",
      cwd: __dirname,

      // Environment
      env_file: ".env",

      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "logs/error.log",
      out_file: "logs/output.log",
      merge_logs: true,
      max_size: "10M",
      retain: 5,

      // Restart policy
      autorestart: true,
      max_restarts: 10,
      min_uptime: "30s",
      restart_delay: 5000,

      // Don't watch for file changes
      watch: false,
    },
  ],
};
