'use strict';

const fs = require('fs/promises');
const path = require('path');
const { env } = require('../config/env');
const { AppError } = require('../utils/AppError');

const EXT_LANGUAGE_MAP = {
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.py': 'python',
  '.ipynb': 'python',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.sh': 'bash',
  '.sql': 'sql',
  '.html': 'xml',
  '.css': 'css',
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.md': 'markdown',
  '.txt': 'plaintext'
};

const SUPPORTED_CODE_EXTENSIONS = Object.keys(EXT_LANGUAGE_MAP);

/** NUL bytes in the first few KB reliably mark a file as non-text. */
function looksBinary(buffer) {
  const sample = buffer.subarray(0, 4096);
  return sample.includes(0);
}

function cellSource(cell) {
  if (Array.isArray(cell.source)) return cell.source.join('');
  if (typeof cell.source === 'string') return cell.source;
  return '';
}

/**
 * Flattens a Jupyter notebook into a single Python listing, keeping markdown
 * cells as comments so the narrative around the code isn't lost.
 */
function extractNotebook(json) {
  if (!json || !Array.isArray(json.cells)) {
    throw AppError.badRequest('That does not look like a valid .ipynb notebook.');
  }

  const blocks = [];
  let codeCellIndex = 0;

  json.cells.forEach((cell) => {
    const source = cellSource(cell).trimEnd();
    if (!source) return;

    if (cell.cell_type === 'code') {
      codeCellIndex += 1;
      blocks.push(`# ── Cell ${codeCellIndex} ──\n${source}`);
      return;
    }

    if (cell.cell_type === 'markdown') {
      const commented = source
        .split('\n')
        .map((line) => `# ${line}`.trimEnd())
        .join('\n');
      blocks.push(commented);
    }
  });

  if (codeCellIndex === 0) {
    throw AppError.badRequest('This notebook has no code cells to convert.');
  }

  return blocks.join('\n\n');
}

async function parseCodeFile({ filePath, originalName, languageOverride }) {
  const extension = path.extname(originalName || '').toLowerCase();
  const buffer = await fs.readFile(filePath);

  if (buffer.byteLength === 0) {
    throw AppError.badRequest('The uploaded file is empty.');
  }

  if (looksBinary(buffer)) {
    throw AppError.badRequest('That file looks binary, not plain text source code.');
  }

  const raw = buffer.toString('utf8');

  if (raw.length > env.maxCodeChars) {
    throw AppError.payloadTooLarge(
      `The file contains ${raw.length.toLocaleString()} characters; the limit is ${env.maxCodeChars.toLocaleString()}.`
    );
  }

  let code = raw;

  if (extension === '.ipynb') {
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      throw AppError.badRequest('Unable to parse the notebook — its JSON is malformed.');
    }

    code = extractNotebook(parsed);
  }

  if (!code.trim()) {
    throw AppError.badRequest('The uploaded file contains no readable code.');
  }

  return { code, language: languageOverride || EXT_LANGUAGE_MAP[extension] || '' };
}

module.exports = { parseCodeFile, SUPPORTED_CODE_EXTENSIONS, EXT_LANGUAGE_MAP };
