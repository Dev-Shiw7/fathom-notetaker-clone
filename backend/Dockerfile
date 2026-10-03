# syntax=docker/dockerfile:1
#
# The notetaker bot runner.
#
# Build from the REPO ROOT (the npm workspace lockfile lives there):
#   docker build -f backend/Dockerfile -t recall-bot .
#
# Why this image looks the way it does:
#  - Real Google Chrome, not Playwright's bundled Chromium. Meet refuses the
#    bundled build for guests, which is the usual reason a hosted bot "can't
#    join". Google only ships Linux Chrome for amd64, so the platform is pinned
#    (Render is amd64; on an Apple-silicon Mac Docker emulates it, slowly).
#  - A virtual display (Xvfb), because guest join only works headed.
#  - A silent PulseAudio sink. With no audio device Chrome's AudioContext can
#    stall, and the recorder taps incoming call audio through one.
FROM --platform=linux/amd64 node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Retries and a generous timeout: the Chrome package is ~100 MB from Google's
# servers, and one stalled connection should not fail the whole build.
RUN printf 'Acquire::Retries "6";\nAcquire::http::Timeout "120";\nAcquire::https::Timeout "120";\n' > /etc/apt/apt.conf.d/80-retries

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg dumb-init \
      xvfb xauth pulseaudio pulseaudio-utils \
      fonts-liberation fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*

# Chrome is its own layer, so a failed download retries only this step.
RUN curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so source edits do not reinstall them. npm needs every
# workspace manifest present to validate the lockfile, even though only the
# backend is installed.
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace @notetaker/backend --include-workspace-root --no-audit --no-fund

COPY backend backend

# Chrome refuses to run as root with its sandbox on, so run as a normal user.
# `out/` holds per-session logs and screenshots and must be writable.
RUN useradd --create-home --uid 1001 bot \
 && mkdir -p /app/backend/out /tmp/runtime-bot \
 && chown -R bot:bot /app/backend/out /tmp/runtime-bot \
 && chmod 700 /tmp/runtime-bot
USER bot
ENV XDG_RUNTIME_DIR=/tmp/runtime-bot \
    NODE_ENV=production

WORKDIR /app/backend
ENTRYPOINT ["dumb-init", "--", "sh", "/app/backend/docker/entrypoint.sh"]
