'use strict';

const fs = require('fs');
const path = require('path');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { runCommand } = require('../utils/runCommand');

const PROBE_TIMEOUT_MS = 25000;
// Re-probe at most this often after a failure, so a transient blip during boot
// doesn't disable a feature until the next deploy.
const RETRY_AFTER_MS = 60 * 1000;

function candidatePaths(configured, extras) {
  const list = [configured, ...extras].filter(Boolean);
  return Array.from(new Set(list));
}

function libreOfficeCandidates() {
  const extras = ['soffice', 'libreoffice'];

  if (process.platform === 'darwin') {
    extras.push(
      '/opt/homebrew/bin/soffice',
      '/usr/local/bin/soffice',
      '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    );
  }

  if (process.platform === 'linux') {
    extras.push('/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/local/bin/soffice', '/snap/bin/libreoffice');
  }

  if (process.platform === 'win32') {
    extras.push(
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
    );
  }

  return candidatePaths(env.libreOfficePath, extras);
}

function pythonCandidates() {
  const extras = ['/opt/venv/bin/python3', 'python3', 'python'];

  if (process.platform === 'darwin') {
    extras.push('/opt/homebrew/bin/python3', '/usr/bin/python3');
  }

  return candidatePaths(env.pythonPath, extras);
}

/** A candidate that looks like a path must actually exist before we spawn it. */
function isSpawnable(candidate) {
  const looksLikePath = candidate.includes('/') || candidate.includes('\\');
  return !looksLikePath || fs.existsSync(candidate);
}

const state = {
  libreOffice: { checkedAt: 0, available: false, binary: '', version: '', reason: 'not probed yet' },
  python: { checkedAt: 0, available: false, binary: '', version: '', reason: 'not probed yet' }
};

const inFlight = new Map();

async function probeLibreOffice() {
  for (const candidate of libreOfficeCandidates()) {
    if (!isSpawnable(candidate)) continue;

    try {
      const { stdout } = await runCommand(candidate, ['--version'], {
        timeoutMs: PROBE_TIMEOUT_MS,
        env: { HOME: env.workDir }
      });

      return {
        available: true,
        binary: candidate,
        version: stdout.trim().split('\n')[0] || 'unknown',
        reason: ''
      };
    } catch (error) {
      logger.debug('LibreOffice candidate rejected', { candidate, error: error.message });
    }
  }

  return {
    available: false,
    binary: '',
    version: '',
    reason:
      'LibreOffice was not found. Install it and set LIBREOFFICE_PATH (macOS: brew install --cask libreoffice).'
  };
}

async function probePython() {
  // Probes the default engine. Both scripts ship together and share their
  // dependencies, so one working means the feature works.
  const script = path.join(env.scriptDir, 'pdf_to_docx_text.py');

  if (!fs.existsSync(script)) {
    return { available: false, binary: '', version: '', reason: 'pdf_to_docx_text.py is missing from the image.' };
  }

  for (const candidate of pythonCandidates()) {
    if (!isSpawnable(candidate)) continue;

    try {
      // --selfcheck imports pdf2docx; a bare `python3 --version` would pass on
      // hosts where the dependency is not installed.
      const { stdout } = await runCommand(candidate, [script, '--selfcheck'], {
        timeoutMs: PROBE_TIMEOUT_MS
      });

      return { available: true, binary: candidate, version: stdout.trim(), reason: '' };
    } catch (error) {
      logger.debug('Python candidate rejected', { candidate, error: error.message });
    }
  }

  return {
    available: false,
    binary: '',
    version: '',
    reason: 'Python with pdf2docx was not found. Install it and set PYTHON_PATH.'
  };
}

const probes = { libreOffice: probeLibreOffice, python: probePython };

async function getCapability(name, { force = false } = {}) {
  const current = state[name];
  const isFresh = current.checkedAt > 0 && (current.available || Date.now() - current.checkedAt < RETRY_AFTER_MS);

  if (!force && isFresh) return current;
  if (inFlight.has(name)) return inFlight.get(name);

  const promise = probes[name]()
    .then((result) => {
      state[name] = { ...result, checkedAt: Date.now() };
      logger[result.available ? 'info' : 'warn'](`Capability probe: ${name}`, {
        available: result.available,
        binary: result.binary,
        reason: result.reason || undefined
      });
      return state[name];
    })
    .finally(() => inFlight.delete(name));

  inFlight.set(name, promise);
  return promise;
}

/** Feature-level view used by /api/health and the capability guard middleware. */
async function getCapabilities(options) {
  const [libreOffice, python] = await Promise.all([
    getCapability('libreOffice', options),
    getCapability('python', options)
  ]);

  return {
    codeToPdf: { available: true, reason: '' },
    imageConvert: { available: true, reason: '' },
    imageCompress: { available: true, reason: '' },
    markdownToPdf: { available: true, reason: '' },
    docxToPdf: {
      available: libreOffice.available,
      reason: libreOffice.reason,
      engine: libreOffice.available ? libreOffice.version : ''
    },
    pdfToDocx: {
      available: python.available,
      reason: python.reason,
      engine: python.available ? python.version : ''
    }
  };
}

/** Warms the probes at boot so the first real request isn't slowed by them. */
function warmUpCapabilities() {
  return getCapabilities({ force: true }).catch((error) => {
    logger.error('Capability warm-up failed', { error: error.message });
    return null;
  });
}

module.exports = { getCapability, getCapabilities, warmUpCapabilities };
