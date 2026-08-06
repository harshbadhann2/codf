# Architecture

Notes on why coDF is built the way it is. Most of these decisions are consequences of one constraint: the API runs on a **512 MB instance that sleeps when idle**.

---

## Why the frontend and API are deployed separately

Vercel runs serverless functions with a read-only filesystem, no persistent processes, and no way to install system packages. Two of the four conversions shell out to LibreOffice and Python. Neither can run there.

So the API needs a container host — Render, in a Docker image carrying its own engines. The frontend is a static bundle and belongs on a CDN.

The cost of that split is **two origins**, which brings CORS and absolute URLs into play. Both were failure points in the previous version, and both are addressed explicitly below.

---

## The two split-deployment bugs, and how they are prevented

### Relative download URLs

The API used to return `downloadPath: "/api/files/<uuid>.pdf"`, and the frontend prefixed it with `VITE_DOWNLOAD_BASE_URL` — which was empty. The link resolved against the *Vercel* domain, where nothing serves `/api/files`, so every download 404'd.

Now the API builds the URL from the incoming request ([`conversion.controller.js`](../apps/api/src/controllers/conversion.controller.js)):

```js
const base = `${req.protocol}://${req.get('host')}`;
downloadUrl: `${base}${downloadPath}?name=${encodeURIComponent(result.originalName)}`
```

There is no configuration to get wrong: the URL is derived from the request that asked for it. This is also why `app.set('trust proxy', 1)` matters — without it, `req.protocol` behind Render's TLS terminator reports `http`, and browsers refuse the mixed-content request.

A test asserts the URL is absolute, so a regression fails CI rather than production.

### CORS failing loudly but uninformatively

The old config threw an `Error` for disallowed origins. Express turns that into a 500 — with no CORS headers, so the browser reports an opaque network failure and the real cause is invisible.

Now ([`config/cors.js`](../apps/api/src/config/cors.js)):

- Disallowed origins are rejected by **omitting the headers** (`callback(null, false)`), never by throwing.
- Each newly blocked origin is logged once, with the allowed list alongside it.
- `GET /api/health` returns `cors: { requestOrigin, allowed }`, so the misconfiguration can be diagnosed with one `curl`.
- `localhost` is always allowed, so local development needs no configuration at all.

---

## Capability probing

`docxToPdf` and `pdfToDocx` depend on binaries that may not exist. Previously a missing LibreOffice surfaced as a 500 during conversion — indistinguishable from a bug.

[`capabilities.service.js`](../apps/api/src/services/capabilities.service.js) probes both at boot, caches the result, and re-probes at most once a minute after a failure. Probing is real, not a `--version` check: the Python probe runs `pdf_to_docx.py --selfcheck`, which imports `pdf2docx`, because a Python interpreter without the library would otherwise look healthy.

The result flows outward:

- `requireCapability()` middleware returns **503 with the reason** before the upload is processed.
- `/api/health` publishes the map.
- The frontend disables those controls and shows the reason inline.

The system tells you what is wrong instead of failing anonymously — the same principle as reporting *why* a build failed rather than just that it did.

---

## Memory: the job queue

512 MB total. Node idles at ~80 MB. A LibreOffice conversion peaks around 200–300 MB; `pdf2docx` on a large PDF can exceed 300 MB. One at a time fits. Two do not.

Without a limit, two concurrent uploads get the **container** OOM-killed — every in-flight request dies, not just the greedy one, and Render restarts the service.

[`jobQueue.js`](../apps/api/src/utils/jobQueue.js) allows one job at a time (`MAX_CONCURRENT_JOBS`) and queues up to 8 more. Past that, callers get a 503 telling them to retry. A slow, honest queue beats a fast crash.

Reinforcing that:

- `NODE_OPTIONS=--max-old-space-size=320` caps Node's heap, leaving headroom for the subprocesses.
- `sharp.cache(false)` and `sharp.concurrency(1)` — Sharp's defaults assume a much larger machine.
- `OMP_NUM_THREADS=1` and friends for the Python process; OpenCV's thread pools cost memory for no benefit here.
- Page and file-size caps bound the largest possible job.

When a subprocess is killed by SIGKILL with no timeout of our own, [`runCommand.js`](../apps/api/src/utils/runCommand.js) reports it as an out-of-memory condition rather than a generic failure, because that is nearly always what it is.

---

## Cold starts

Render stops the free instance after ~15 minutes idle. The next request pays 30–60 seconds. Nothing can remove that; the question is whether it looks like *waiting* or like *broken*.

- [`useServerStatus.js`](../apps/web/src/hooks/useServerStatus.js) probes `/api/health` on load with a short first timeout, then retries with longer ones, exposing `checking → waking → online | offline`.
- The banner says "waking the server up", explains why, and invites the user to fill in the form meanwhile.
- Capability probes run at **boot**, not on first request, so the wake-up cost is paid once rather than added to the user's first conversion.
- `.github/workflows/keepalive.yml` pings during the day, limited so it does not exhaust the monthly compute quota.

---

## File handling

Uploads go to disk via Multer, never to memory: a 10 MB buffer per concurrent upload is real money at this size.

Everything lives under `WORK_DIR` (default `<tmp>/codf`) rather than the source tree, so the app never depends on its image layer being writable.

Cleanup runs at three levels, because the first two are individually unreliable:

1. The upload is deleted in a `finally` block as soon as conversion ends.
2. The output is deleted by a timer after `FILE_TTL_MS`.
3. A periodic sweep removes anything older than the TTL — timers do not survive a restart, so this is what actually bounds disk usage.

Output names are server-generated UUIDs validated against a strict regex, and the resolved path is re-checked to be inside the output directory. The user's real filename travels as a `?name=` query parameter and is re-sanitised on the way out, so a meaningful `Content-Disposition` never becomes a path-traversal vector.

---

## Hitting a file-size target

Form portals reject uploads outside a byte range, so "make this photo fit in
50 KB" is a real constraint, not a preference.
[`imageCompress.service.js`](../apps/api/src/services/imageCompress.service.js)
resolves it in this order, cheapest and least destructive first:

0. **A sane starting resolution**, before anything else. Answering "fit this in
   100 KB" by encoding a 12 MP photo seven times is wasted work — no answer at
   that resolution was ever going to fit. Each probe also decodes the full
   image, which is what turned a slow request into an OOM kill on the free
   instance. The working resolution is capped at ~20 px per target byte, which
   costs nothing in quality (the search would have landed near there anyway)
   and lets libvips use shrink-on-load so the full image is never decoded. On a
   12 MP source this took a 100 KB request from 108 s to under 2 s, at *higher*
   output resolution than before.
1. **Quality**, by binary search over the encoder's quality setting for the
   highest value that still fits. Roughly seven encodes, and it usually ends
   here.
2. **Pixels**, only when quality alone cannot get there. Encoded size tracks
   pixel count, so the next scale factor is estimated as
   `sqrt(target / achieved)` rather than stepped down blindly — that converges
   in one or two rounds instead of ten. Quality has a floor of 20 because
   below it a passport photo is unusable, and a smaller sharp image beats a
   full-size smeared one.
3. **Metadata**, when a *minimum* is specified and the picture legitimately
   encodes below it. Quality climbs to 100 with 4:4:4 chroma first; if that is
   still short, padding goes into a JPEG `COM` segment or a PNG `tEXt` chunk —
   standard containers, so the file stays fully valid rather than carrying
   junk after the end-of-image marker, which a strict validator may reject.

Each of the three is reported back (`quality`, `downscaled`, `padded`) so the
UI can explain what happened instead of silently handing over a photo that is
smaller than the one the user chose.

`downscaled` deliberately means "the size target forced us below the requested
dimensions", not "the output is smaller than the input" — resizing to the
dimensions someone explicitly asked for is the job, and flagging it as a
problem sends them off to fix something that is not broken.

## Upload validation

Three independent checks, because the first two are attacker-controlled:

1. **Extension** — a typo filter, nothing more.
2. **Size** — enforced by Multer as bytes stream in, so an oversized upload is cut off rather than buffered.
3. **Magic number** — [`fileSignature.js`](../apps/api/src/utils/fileSignature.js) reads the first bytes. A `.pdf` that is not `%PDF` is rejected before any converter sees it.

MIME type is deliberately *not* trusted: browsers disagree about `.docx` (`application/zip`, `application/octet-stream`, the full OOXML type), so checking it rejects legitimate files while stopping nothing.

---

## Code → PDF rendering

The only conversion implemented in-process, so it works everywhere and never touches the job queue's external-tool path.

highlight.js emits nested `<span class="hljs-*">` markup; [`codeTokens.js`](../apps/api/src/utils/codeTokens.js) walks it with htmlparser2, keeping a stack of in-scope classes, and flattens it to `(text, class)` pairs PDFKit can draw.

Layout is **measure, then draw** ([`codePdf.service.js`](../apps/api/src/services/codePdf.service.js)):

1. Wrap every source line to the panel width. Panel width is identical on every page, so wrapping is page-independent and runs once.
2. Slice the resulting rows into pages by capacity.
3. Draw. Because the row count per page is known in advance, the panel on the final page shrinks to fit rather than running to the bottom of the sheet.

Two PDFKit behaviours drove the design:

- `text()` past the bottom margin silently **inserts a new page**. Footers therefore go through `bufferedPageRange()` after all content, with `margins.bottom` temporarily zeroed. Drawing them inline was doubling the page count.
- Character-by-character width measurement is O(n²) on long lines. `fittingPrefixLength()` binary-searches instead, which matters at the 300k-character limit.

JetBrains Mono is committed to `assets/fonts/` rather than resolved from the system, so a PDF generated on Render is byte-identical in appearance to one generated locally.

---

## Testing

The API suite runs on `node:test` with no HTTP-client dependency — the server is bound to port 0 and driven with `fetch`.

It deliberately runs **without LibreOffice or Python installed**, which is the state of a GitHub runner. That is the point: it proves the app starts, serves, and degrades gracefully when its optional engines are absent, rather than only proving the happy path.

Verifying the engines *are* present is a separate CI job that builds the real image, runs it under `--memory=512m` (matching the free instance), and asserts every capability reports available. An image that builds but cannot convert is exactly how the previous deployment failed, so it is checked directly.
