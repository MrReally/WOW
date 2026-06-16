#!/usr/bin/env bash
# Point the bot's menu button at the Mini App, so users can open SEVER from the
# bot chat. Run once after you have a public HTTPS URL.
#
#   TELEGRAM_BOT_TOKEN=123:abc ./scripts/set-telegram-menu.sh https://your-public-url
#
# The URL MUST be public HTTPS (Telegram loads it on the user's phone — localhost
# won't work). For local testing, expose http://localhost:8080 with a tunnel,
# e.g.  cloudflared tunnel --url http://localhost:8080
set -euo pipefail

URL="${1:-}"
TOKEN="${TELEGRAM_BOT_TOKEN:-}"
if [ -z "$URL" ] || [ -z "$TOKEN" ]; then
  echo "usage: TELEGRAM_BOT_TOKEN=... $0 https://your-public-url" >&2
  exit 1
fi

curl -s "https://api.telegram.org/bot${TOKEN}/setChatMenuButton" \
  -H 'Content-Type: application/json' \
  -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Открыть SEVER\",\"web_app\":{\"url\":\"${URL}\"}}}"
echo
echo "Done. Open your bot in Telegram — the menu button now opens $URL"
