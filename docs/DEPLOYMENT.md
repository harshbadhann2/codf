# Deploying coDF

Frontend on Vercel, API on Render. Roughly 15 minutes end to end, most of it waiting for Render's first Docker build.

> **The two settings that decide whether this works**
>
> 1. `VITE_API_BASE_URL` on **Vercel** — where the frontend sends requests.
> 2. `CLIENT_ORIGIN` on **Render** — which frontends the API accepts requests from.
>
> Miss the first and the frontend calls itself and 404s. Miss the second and the browser blocks every request with a CORS error. Together they account for almost every "frontend works, backend doesn't" split deployment.

---

## 0 · Push to GitHub

```bash
cd ~/Documents/Projects/codf
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/codf.git
git push -u origin main
```

Nothing secret is committed — `.gitignore` covers `.env` files, and only `.env.example` is tracked.

---

## 1 · API on Render

### Deploy

1. <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect the repo. Render finds `render.yaml` and proposes a service named **codf-api**.
3. It will prompt for `CLIENT_ORIGIN` (marked `sync: false` so it is never committed). You do not have a Vercel URL yet — enter a placeholder like `https://placeholder.vercel.app` and correct it in step 3.
4. **Apply**. The first build takes **8–15 minutes**: it installs LibreOffice and a Python environment. Later builds are much faster thanks to layer caching.

### Verify

```bash
curl https://<your-service>.onrender.com/api/health
```

Look at `data.capabilities`. All four must report `"available": true`:

```json
{
  "codeToPdf":    { "available": true },
  "imageConvert": { "available": true },
  "docxToPdf":    { "available": true, "engine": "LibreOffice 7.4…" },
  "pdfToDocx":    { "available": true, "engine": "pdf2docx 0.5.13 …" }
}
```

If one says `false`, its `reason` tells you what is missing from the image. Do not move on — a green Render dashboard only means the process is running, not that it can convert anything.

Copy your API URL. It looks like `https://codf-api.onrender.com`.

---

## 2 · Frontend on Vercel

1. <https://vercel.com/new> → import the same repo.
2. **Root Directory** → **`apps/web`**. ← *This is the step people miss.* Without it Vercel builds from the repo root, finds no app, and fails.
3. Framework preset should auto-detect as **Vite**. Leave the build settings alone; `apps/web/vercel.json` handles the rest.
4. Under **Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `VITE_API_BASE_URL` | `https://codf-api.onrender.com` |

   No trailing slash. No `/api` suffix — the client appends that. Apply it to Production, Preview, and Development.
5. **Deploy**.

> Vite inlines env vars at **build** time, not runtime. Changing `VITE_API_BASE_URL` later has no effect until you redeploy.

---

## 3 · Point the API back at the frontend

Copy your Vercel URL (e.g. `https://codf.vercel.app`), then in Render: **codf-api → Environment → `CLIENT_ORIGIN`**.

```
https://codf.vercel.app
```

No trailing slash. Multiple origins are comma separated, which is what you want once you add a custom domain:

```
https://codf.vercel.app,https://codf.yourdomain.com
```

Save. Render redeploys automatically (~1 minute; it does not rebuild the image).

Preview deployments get a new URL per commit, so `render.yaml` also sets `ALLOW_VERCEL_PREVIEWS=true`, which permits any `https://*.vercel.app`. Set it to `false` if you would rather list origins explicitly.

---

## 4 · Confirm end to end

Open your Vercel URL and paste some code into **Code → PDF**.

For a machine-checkable version:

```bash
curl -H "Origin: https://codf.vercel.app" \
     https://codf-api.onrender.com/api/health | jq '.data.cors'
```

```json
{ "requestOrigin": "https://codf.vercel.app", "allowed": true }
```

`"allowed": false` means `CLIENT_ORIGIN` does not match — check for a trailing slash, `http` vs `https`, or a missing `www`.

---

## 5 · Keep it warm (optional)

Free instances sleep after ~15 minutes idle; the next visitor waits 30–60 seconds. The app handles this honestly (it says "waking the server up"), but you can reduce how often it happens:

1. GitHub repo → **Settings → Secrets and variables → Actions → Variables → New**.
2. Name `API_URL`, value `https://codf-api.onrender.com`.

`.github/workflows/keepalive.yml` then pings every 14 minutes between 06:00 and 20:00 UTC. Without the variable it skips silently.

Free instances also have a monthly compute quota — pinging around the clock would spend it keeping the server up for nobody, which is why the schedule is limited to daytime.

---

## Troubleshooting

### "Cannot reach the conversion server"

The banner shows the API URL it tried. Check it against your Render URL.

- Wrong or empty → fix `VITE_API_BASE_URL` on Vercel **and redeploy**.
- Correct → open `https://<api>/api/health` directly. If that works in a browser but not from the app, it is CORS: go to the next section.

### CORS errors in the browser console

> Access to XMLHttpRequest … has been blocked by CORS policy

The API did not recognise your frontend's origin.

```bash
curl -H "Origin: https://your-app.vercel.app" \
     https://your-api.onrender.com/api/health | jq '.data.cors'
```

Then set `CLIENT_ORIGIN` on Render to exactly the origin shown as `requestOrigin`. Common mismatches: a trailing slash, `http` instead of `https`, or `www.` present on one side only.

The API also logs a warning naming the blocked origin, visible in Render → Logs.

### A conversion says "unavailable"

The API is up but the engine it needs is not in the image. `GET /api/health` gives the reason. If the Docker build succeeded, all four should be available — a `false` here usually means the build silently skipped a stage. Check the Render build log for `apt-get` or `pip` errors and redeploy.

### First request takes 60 seconds

Normal for a sleeping free instance. See [step 5](#5--keep-it-warm-optional).

### "The server ran out of memory"

A 512 MB instance ran out mid-conversion, most often on a large or image-heavy PDF. Options:

- Lower `PDF_TO_DOCX_MAX_PAGES` (default 60).
- Lower `MAX_FILE_SIZE_MB` (default 10).
- Keep `MAX_CONCURRENT_JOBS=1` — raising it is the fastest way to make this worse.
- Upgrade to Render's Starter plan for more RAM.

### Downloads 404

Converted files are deleted after `FILE_TTL_MS` (15 minutes). A link from an old tab will have expired — convert again. If a *fresh* download 404s, the API was redeployed between converting and downloading; the filesystem is ephemeral and does not survive a restart.

### Render build fails or times out

The image is large. If the build times out, retry — layer caching means the second attempt starts from where apt and pip left off.

---

## Environment variables

### Render (API)

| Variable | Default | Notes |
| --- | --- | --- |
| `CLIENT_ORIGIN` | — | **Required in production.** Comma-separated frontend origins. |
| `ALLOW_VERCEL_PREVIEWS` | `true` | Also allow `https://*.vercel.app`. |
| `CLIENT_ORIGIN_REGEX` | — | Extra origins as regular expressions. |
| `TRUST_PROXY` | `1` | Render terminates TLS one hop ahead. Do not set to `0`. |
| `MAX_FILE_SIZE_MB` | `10` | |
| `MAX_CODE_CHARS` | `300000` | |
| `PDF_TO_DOCX_MAX_PAGES` | `60` | Main lever on peak memory. |
| `FILE_TTL_MS` | `900000` | Download window (15 min). |
| `MAX_CONCURRENT_JOBS` | `1` | Leave at 1 on the free plan. |
| `CONVERT_RATE_LIMIT_MAX` | `60` | Conversions per IP per 15 min. |
| `LOG_LEVEL` | `info` | `debug` while diagnosing. |

`PORT` is injected by Render — never set it yourself.

### Vercel (frontend)

| Variable | Notes |
| --- | --- |
| `VITE_API_BASE_URL` | **Required.** Render URL, no trailing slash, no `/api`. |
| `VITE_MAX_FILE_SIZE_MB` | Optional; the app prefers the value from `/api/health`. |

---

## Custom domain

1. Add the domain in Vercel (**Settings → Domains**) and follow its DNS instructions.
2. Add it to `CLIENT_ORIGIN` on Render, comma separated, keeping the `.vercel.app` origin so both keep working.
3. Redeploy on Render.
