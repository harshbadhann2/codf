'use strict';

const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const { AppError } = require('../utils/AppError');
const { logger } = require('../utils/logger');
const { runCommand } = require('../utils/runCommand');
const { sanitizeBaseName } = require('../utils/sanitizeFilename');
const { ensureWorkspace } = require('../utils/workspace');
const { getCapability } = require('./capabilities.service');

/** Reads the JSON error the script prints on stderr before giving up. */
function extractScriptError(stderr) {
  const line = String(stderr || '')
    .trim()
    .split('\n')
    .reverse()
    .find((entry) => entry.trim().startsWith('{'));

  if (!line) return '';

  try {
    return JSON.parse(line).error || '';
  } catch {
    return '';
  }
}

/**
 * Converts a PDF or Word document into Markdown.
 *
 * The structural work all happens in `scripts/to_markdown.py`; this is the
 * boundary around it — capability check, argument assembly, and turning the
 * script's failure modes into errors that say something useful to a person.
 */
async function convertToMarkdown({ inputPath, originalBaseName, sourceFormat }) {
  const capability = await getCapability('pymupdf');

  if (!capability.available) {
    throw AppError.unavailable(capability.reason, { code: 'to_markdown_unavailable' });
  }

  ensureWorkspace();

  const script = path.join(env.scriptDir, 'to_markdown.py');

  try {
    const { stdout } = await runCommand(
      capability.binary,
      [script, inputPath, '--max-pages', String(env.pdfToDocxMaxPages)],
      {
        timeoutMs: env.ocrTimeoutMs,
        env: {
          HOME: env.workDir,
          OMP_THREAD_LIMIT: '1',
          OMP_NUM_THREADS: '1',
          PYTHONUNBUFFERED: '1'
        }
      }
    );

    const parsed = JSON.parse(stdout);
    const markdown = String(parsed.markdown || '');

    const outputFileName = `${randomUUID()}.md`;
    const outputPath = path.join(env.outputDir, outputFileName);

    await fs.writeFile(outputPath, markdown, 'utf8');

    return {
      outputPath,
      outputFileName,
      originalName: `${sanitizeBaseName(originalBaseName, 'converted')}.md`,
      text: markdown,
      characters: parsed.characters,
      words: parsed.words,
      pages: parsed.pages,
      headings: parsed.headings,
      tables: parsed.tables,
      listItems: parsed.listItems,
      codeBlocks: parsed.codeBlocks,
      truncated: Boolean(parsed.truncated),
      sourceFormat
    };
  } catch (error) {
    if (error instanceof AppError) throw error;

    if (error.code === 'ETIMEDOUT') {
      throw AppError.unavailable('Converting this document took too long. Try a shorter document.');
    }

    if (error.exitCode === 2) {
      throw AppError.badRequest(
        extractScriptError(error.stderr) || 'No text could be read from this document.'
      );
    }

    if (error.signal === 'SIGKILL') {
      throw AppError.unavailable('The server ran out of memory converting this document. Try fewer pages.');
    }

    logger.error('markdown conversion failed', { error: error.message, sourceFormat });
    throw AppError.internal('Could not convert this document to Markdown.');
  }
}

module.exports = { convertToMarkdown };
