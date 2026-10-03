#!/bin/sh
# Starts the things Chrome needs, then runs the queue runner.
#
# Required environment:
#   APP_URL    where the web app lives, e.g. https://recall-web.onrender.com
#   BOT_TOKEN  must equal the BOT_TOKEN configured on the web app
set -eu

: "${APP_URL:?APP_URL is not set - point it at the deployed web app}"
: "${BOT_TOKEN:?BOT_TOKEN is not set - it must match the BOT_TOKEN on the web app}"

# A silent audio output. The meeting's audio goes nowhere audible; the bot
# records it from inside the page instead.
pulseaudio --start --exit-idle-time=-1 --log-target=stderr >/dev/null 2>&1 || true
pactl load-module module-null-sink sink_name=recall_sink >/dev/null 2>&1 || true
pactl set-default-sink recall_sink >/dev/null 2>&1 || true

# A virtual screen for the headed browser.
exec xvfb-run -a --server-args="-screen 0 1280x960x24 -ac" \
  npx --no-install tsx src/index.ts watch \
    --api "$APP_URL" \
    --token "$BOT_TOKEN" \
    ${RUNNER_NAME:+--runner "$RUNNER_NAME"} \
    ${BOT_PROFILE_DIR:+--profile "$BOT_PROFILE_DIR"}
