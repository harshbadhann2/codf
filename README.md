# coDF

A student utility converter: turn source code into a clean, syntax-highlighted PDF, convert Word ↔ PDF, and convert between image formats.

**Frontend** (React + Vite) deploys to **Vercel**. **API** (Node + Express, in Docker) deploys to **Render**.

```
┌─────────────────┐         HTTPS          ┌──────────────────────────┐
│  Vercel (web)   │ ─────────────────────► │  Render (api, Docker)    │
│  static React   │  /api/convert/*        │  Node + Express          │
│                 │ ◄───────────────────── │  ├─ PDFKit  (code → PDF) │
└─────────────────┘   absolute downloadUrl │  ├─ Sharp   (images)     │
                                           │  ├─ LibreOffice (docx→pdf)│
                                           │  └─ pdf2docx  (pdf→docx) │
                                           └──────────────────────────┘
```

---

## Quick start

```bash
npm install --prefix apps/api && npm install --prefix apps/web
```

Two terminals:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

The app is at <http://localhost:3000> and the API at <http://localhost:3030>. No `.env` file is needed for local development — the Vite dev server proxies `/api` to the API, and localhost is always an allowed CORS origin.

`Code → PDF` and image conversion work immediately. The two document conversions need external tools; see [Optional local tools](#optional-local-tools). Without them the app still runs and clearly marks those conversions unavailable.

---

## Deploying

The full walkthrough, with the failure modes worth knowing about, is in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. The short version:

| Step | Where | What |
| --- | --- | --- |
| 1 | Render | New → Blueprint → this repo. `render.yaml` configures everything. |
| 2 | Vercel | New Project → this repo → **Root Directory = `apps/web`**. |
| 3 | Vercel | Set `VITE_API_BASE_URL` to your Render URL, then **redeploy**. |
| 4 | Render | Set `CLIENT_ORIGIN` to your Vercel URL. |

Steps 3 and 4 are not optional. Skipping 3 leaves the frontend calling itself; skipping 4 makes the browser block every request with a CORS error. Both are the classic ways a split deployment ends up "frontend works, backend doesn't".

Verify with:

```bash
curl https://your-api.onrender.com/api/health
```

The response reports which conversions this deployment can actually perform, and whether your origin passes the CORS check.

---

## Features

- **Code → PDF** — syntax highlighting for 190+ languages via highlight.js, rendered with JetBrains Mono, with line numbers, a title/subtitle block, and page footers. Accepts pasted code or an uploaded file, including Jupyter notebooks (`.ipynb`, flattened with markdown cells as comments).
- **Markdown → Word** — a real .docx built with Word's own styles (Heading 1..6, List Bullet, List Number, Quote, Table Grid), so the recipient can restyle and keep editing it. Real hyperlinks, nested lists, and the arrows, symbols and emoji a PDF's standard fonts cannot encode.
- **Markdown → PDF** — a real typesetter rather than a print stylesheet: headings, lists, tables, blockquotes, task lists and syntax-highlighted code, in a light or dark page theme. Every block is measured before anything is drawn, so a code listing is never sliced in half by a page break and a heading never ends up alone at the foot of a page.
- **PDF / Word → Markdown** — the reverse trip. A `.docx` states its own structure, so headings, lists, tables, bold, italics and links come across almost exactly. A PDF states nothing, so structure is inferred from the layout — font size ranked against the document's own body size, weight, indentation — and hard-wrapped lines are rejoined into real paragraphs. The result view says which of the two happened, because one is exact and the other is a good guess.
- **Word → PDF** — headless LibreOffice, with Liberation fonts so Microsoft-font documents keep their pagination.
- **PDF → Word** — two engines. The default rebuilds the document as real Word content (headings, paragraphs, bullet lists, tab stops, section rules), which is both editable and the only option that survives LaTeX-produced PDFs. `mode=layout` switches to `pdf2docx`, which reproduces page positioning and is better for forms and dense tables.
- **Image → Text (OCR)** — pull the words out of a screenshot, photo or scan so they can be copied. PDFs are handled too: any real text layer is copied out exactly, and only pages that lack one are recognised from the image, which is both faster and more accurate than OCRing everything.
- **Images** — JPG / PNG / WebP in any direction via Sharp, with EXIF rotation applied and transparency flattened for JPG.
- **Resize for forms** — compress a photo to fit an upload limit ("must be under 100 KB"), optionally at exact pixel dimensions. Handles the *range* case too ("between 20 KB and 50 KB"), which is what exam boards and admission portals actually ask for.
- Dark mode, drag-and-drop, upload progress, cancellable conversions.

## How it stays up on a free instance

Render's free tier gives 512 MB of RAM and stops the container after ~15 minutes of inactivity. A few things follow from that, and they are the difference between this working and not:

- **Heavy conversions are serialised** ([`jobQueue.js`](apps/api/src/utils/jobQueue.js)). Two concurrent LibreOffice or PyMuPDF processes will get the container OOM-killed, which drops every in-flight request rather than just the greedy one. Requests past the queue limit get a clean 503.
- **Capabilities are probed at boot** ([`capabilities.service.js`](apps/api/src/services/capabilities.service.js)) and reported by `/api/health`. If LibreOffice is missing, the UI disables Word → PDF and shows why, instead of returning a bare 500.
- **Cold starts are visible.** The frontend polls health on load and says "waking the server up" rather than looking broken. `.github/workflows/keepalive.yml` pings the API during the day to reduce how often that happens.
- **Files live in the OS temp directory** with a TTL sweep, because the container filesystem is ephemeral and disk is not free.

## API

Base URL: `https://<your-api>/api`

| Method | Endpoint | Body | Notes |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Status, limits, capabilities, queue depth, CORS check |
| `GET` | `/health/ping` | — | Cheap liveness probe (`pong`) |
| `POST` | `/convert/code-to-pdf` | JSON: `code`, `filename?`, `language?`, `title?`, `section?` | |
| `POST` | `/convert/code-file-to-pdf` | multipart: `file` + the same optional fields | |
| `POST` | `/convert/markdown-to-pdf` | JSON: `markdown`, `filename?`, `title?`, `subtitle?`, `theme?` (`light`\|`dark`), `pageSize?` (`a4`\|`letter`) | |
| `POST` | `/convert/markdown-file-to-pdf` | multipart: `file` + the same optional fields | |
| `POST` | `/convert/markdown-to-docx` | JSON: `markdown`, `filename?`, `title?`, `subtitle?`, `pageSize?` | Needs Python |
| `POST` | `/convert/markdown-file-to-docx` | multipart: `file` + the same optional fields | Needs Python |
| `POST` | `/convert/docx-to-pdf` | multipart: `file` | Needs LibreOffice |
| `POST` | `/convert/pdf-to-docx` | multipart: `file`, `mode?` (`text` default \| `layout`) | Needs Python |
| `POST` | `/convert/to-markdown` | multipart: `file` (`.pdf` or `.docx`) | Needs Python |
| `POST` | `/convert/image` | multipart: `file`, `targetFormat` (`png`\|`jpg`\|`webp`), `quality?` | |
| `POST` | `/convert/image-to-text` | multipart: `file`, `mode?` (`auto`\|`block`\|`line`), `language?` | Needs Tesseract |
| `POST` | `/convert/pdf-to-text` | multipart: `file`, `mode?`, `forceOcr?` | Text layer, OCR fallback |
| `POST` | `/convert/image-compress` | multipart: `file`, `targetKb`, `minKb?`, `width?`, `height?`, `fit?` (`cover`\|`inside`), `format?` | Compress to a size limit |
| `GET` | `/files/:fileName?name=<download-name>` | — | Streams the result |

Success:

```json
{
  "success": true,
  "data": {
    "outputFileName": "0f9c…-….pdf",
    "originalName": "assignment_solution.pdf",
    "downloadUrl": "https://your-api.onrender.com/api/files/0f9c….pdf?name=assignment_solution.pdf",
    "expiresInMs": 900000,
    "detectedLanguage": "python"
  }
}
```

`downloadUrl` is absolute on purpose. The frontend is served from a different origin than the API, so a relative path would resolve against Vercel and 404.

Failure:

```json
{
  "success": false,
  "error": { "code": "capability_unavailable", "message": "…", "requestId": "…" }
}
```

`requestId` also comes back in the `X-Request-Id` header — use it to find the matching line in the Render logs.

## Project layout

```
codf/
├── apps/
│   ├── api/                  → Render (Docker)
│   │   ├── Dockerfile        Node + LibreOffice + Python venv
│   │   ├── requirements.txt  pdf2docx and friends
│   │   ├── assets/fonts/     JetBrains Mono, committed for identical output
│   │   ├── scripts/          pdf_to_docx.py
│   │   ├── src/
│   │   │   ├── config/       env, cors, multer
│   │   │   ├── controllers/  request → service → response
│   │   │   ├── middleware/   validation, rate limits, capability guard, errors
│   │   │   ├── routes/
│   │   │   ├── services/     the actual conversions
│   │   │   └── utils/        job queue, cleanup, logging, filename safety
│   │   └── test/             node:test suite, no external tools required
│   └── web/                  → Vercel
│       ├── vercel.json
│       └── src/{api,components,hooks,lib,styles}
├── docs/
│   ├── DEPLOYMENT.md         step by step, plus what to do when it breaks
│   └── ARCHITECTURE.md       why it is built this way
└── render.yaml               Render Blueprint
```

## Commands

```bash
npm run dev:api        # API with file watching
npm run dev:web        # Vite dev server
npm test               # API test suite
npm run lint           # both workspaces
npm run docker:build   # build the exact image Render will run
npm run docker:run     # run it locally on :3030
```

## Optional local tools

Only needed to test document conversion on your own machine — the Docker image already contains both.

```bash
brew install --cask libreoffice
```

```bash
python3 -m venv apps/api/venv && apps/api/venv/bin/pip install -r apps/api/requirements.txt
```

Then point the API at them in `apps/api/.env`:

```
LIBREOFFICE_PATH=/Applications/LibreOffice.app/Contents/MacOS/soffice
PYTHON_PATH=./venv/bin/python3
```

Confirm with `curl localhost:3030/api/health | jq .data.capabilities`.

## Limits

- PDF → Word needs a text-based PDF. Scanned or image-only PDFs produce an empty document; there is no OCR.
- Complex multi-column PDF layouts convert imperfectly. That is a limitation of the parser, not the plumbing.
- `.doc` (the pre-2007 format) is not supported — only `.docx`.
- Uploads are capped at 10 MB and PDFs at 60 pages by default. Both are configurable, but raising them on a 512 MB instance invites OOM kills.

## Contact

Suggestions, bug reports and feature requests: **badhann.work@gmail.com**.

## Licence

JetBrains Mono is bundled under the [SIL Open Font License 1.1](https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt).
