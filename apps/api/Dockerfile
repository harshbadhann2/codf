# syntax=docker/dockerfile:1
#
# coDF API image. Build context is apps/api.
#
# The runtime carries three external engines:
#   - Node          : code -> PDF (PDFKit) and image conversion (Sharp)
#   - LibreOffice   : Word (.docx) -> PDF
#   - Python/pdf2docx: PDF -> Word (.docx)
#
# Layers are ordered cheapest-to-change last, so a source edit rebuilds in
# seconds instead of reinstalling ~1 GB of system packages.

# ───────────────────────── Stage 1: node_modules ─────────────────────────
FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json* ./

# --include=optional matters: Sharp ships its binaries as platform-specific
# optional packages, and omitting them yields a "Could not load sharp" crash
# at boot rather than at build time.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --include=optional --no-audit --no-fund

# ───────────────────────── Stage 2: python engine ────────────────────────
FROM node:20-bookworm-slim AS python-deps

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-venv \
      python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt

# An isolated venv keeps us clear of Debian's PEP 668 "externally managed
# environment" restriction without resorting to --break-system-packages.
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt \
    && find /opt/venv -name '__pycache__' -type d -prune -exec rm -rf {} + \
    && find /opt/venv -name '*.pyc' -delete

# ───────────────────────── Stage 3: runtime ──────────────────────────────
FROM node:20-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer \
      libreoffice-core \
      python3 \
      # Runtime shared libs for opencv-python-headless and PyMuPDF.
      libglib2.0-0 \
      libgomp1 \
      # Metric-compatible stand-ins for Arial/Times/Courier. Without these,
      # .docx files that use Microsoft fonts reflow and repaginate on export.
      fonts-liberation2 \
      fonts-dejavu-core \
      tini \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/* /usr/share/doc/* /usr/share/man/*

COPY --from=python-deps /opt/venv /opt/venv

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY scripts ./scripts
COPY assets ./assets

# Run unprivileged. The base image already provides uid/gid 1000 as `node`.
RUN mkdir -p /var/tmp/codf && chown -R node:node /var/tmp/codf /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3030 \
    WORK_DIR=/var/tmp/codf \
    LIBREOFFICE_PATH=/usr/bin/soffice \
    PYTHON_PATH=/opt/venv/bin/python3 \
    HOME=/var/tmp/codf \
    NODE_OPTIONS=--max-old-space-size=320

USER node

EXPOSE 3030

# Node is not designed to be PID 1; tini reaps the LibreOffice and Python
# children this service spawns and forwards SIGTERM cleanly on redeploy.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3030)+'/api/health/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
