# Deploying Recall

Two things deploy, and they are independent:

| Piece | What it is | Where |
|---|---|---|
| **recall-web** | The Next.js app: UI, API, database, Groq calls | Render web service |
| **recall-bot** | Real Chrome that joins Google Meet and records | Render worker, from `backend/Dockerfile` |

You also need a **MongoDB Atlas** database and a **Groq API key**. No Google account is needed: the bot joins Meet as a named guest and the host admits it.

## 1. Before you deploy

1. Atlas: create a cluster, add a database user, and under *Network Access* allow `0.0.0.0/0` (Render's IPs change). Copy the connection string.
2. Seed the sample meetings once, from your machine: `npm run seed -w @notetaker/frontend`
   (with `frontend/.env.local` containing `MONGODB_URI`). Without this the library is empty.
3. Push the repo to GitHub.

## 2. Deploy with the Blueprint

Render dashboard → **New → Blueprint** → select the repo. It reads `render.yaml` and creates both services.

Fill in the variables Render asks for:

| Service | Variable | Value |
|---|---|---|
| recall-web | `MONGODB_URI` | your Atlas connection string |
| recall-web | `GROQ_API_KEY` | your Groq key |
| recall-bot | `APP_URL` | recall-web's public URL, e.g. `https://recall-web.onrender.com` (no trailing slash) |

`BOT_TOKEN` is generated on recall-web and handed to the bot automatically.

Deploy recall-web first. Once it is live, set `APP_URL` on recall-bot and deploy it.

## 3. Check it works

1. Open the web URL. `/calls` should list the two sample meetings.
2. In the bot's **Logs** you should see `notetaker runner "..."  polling every 10s`. A line like `Unauthorised - BOT_TOKEN does not match` means the two services have different tokens.
3. On the landing page, paste a Meet link and click **Send Recall**. The status card should go Queued, Picked up, Joining. Let the bot in from the Meet lobby.

## What has been verified

The image was built and run locally (Docker Desktop, emulating amd64 on an Apple-silicon Mac):

- Google Chrome 154 installs and launches **headed** on the virtual display.
- The silent PulseAudio sink comes up, the browser's `AudioContext` runs, and a `MediaRecorder` on it produces audio data. This is the path the bot uses to record a call.
- The runner starts, authenticates with `BOT_TOKEN` and polls the web app every 10 seconds.

Not verified: a real Meet call from inside the container, and whether Meet admits a guest from Render's IP addresses.

## Notes and limits

- **Cost.** The bot worker needs about 1-2 GB (Chrome plus a live call), so `plan: standard`. Background workers are not available on Render's free tier. Check current pricing.
- **Chrome is amd64-only on Linux**, so the image is pinned to `linux/amd64`. Render builds it natively. On an Apple-silicon Mac, local builds run under emulation and are slow.
- **Datacenter IPs.** Meet can be stricter with guests coming from cloud IPs than from a home connection. This has not been tested from Render. If the bot is refused there but works from a laptop, run the runner on a laptop instead (same command, see below).
- **Meetings limited to one organisation** refuse guests. That needs a signed-in profile (`BOT_PROFILE_DIR`), which is not set up here.
- **Recording length.** Groq's free tier caps a file at 25 MB, about 100 minutes of audio.
- The first image build downloads about 1 GB of system packages (Chrome is about 100 MB of that); on a slow connection it can take over an hour. Render builds on a fast network.
- Session logs and screenshots are written inside the container and are lost on redeploy.

## Run the bot locally instead of on Render

```sh
npm run backend -- watch --api https://<recall-web-url> --token <BOT_TOKEN>
```

## Build and try the image locally

```sh
docker build -f backend/Dockerfile -t recall-bot .
docker run --rm -e APP_URL=https://<recall-web-url> -e BOT_TOKEN=<token> --shm-size=1g recall-bot
```
