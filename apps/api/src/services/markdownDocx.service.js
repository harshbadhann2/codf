'use strict';

const fs = require('fs/promises');
const path = require('path');
const { marked } = require('marked');
const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const { AppError } = require('../utils/AppError');
const { logger } = require('../utils/logger');
const { runCommand } = require('../utils/runCommand');
const { sanitizeBaseName } = require('../utils/sanitizeFilename');
const { safeUnlink } = require('../utils/fileCleanup');
const { ensureWorkspace } = require('../utils/workspace');
const { getCapability } = require('./capabilities.service');

/**
 * Markdown → Word (.docx).
 *
 * Parsing happens here, with the same `marked` lexer that feeds the PDF
 * renderer, so both outputs agree about what a document means — a second
 * parser would eventually disagree with the first about some edge case, and
 * the bug would only show as "the Word file looks different to the PDF".
 * Rendering happens in Python, because python-docx already ships in the image
 * for the reverse conversion and knows how to write OOXML.
 *
 * LibreOffice could convert HTML → docx instead, but it is the heaviest
 * process on a 512 MB instance and its HTML importer gives far less control
 * over the result. This route also keeps working on a host where LibreOffice
 * is missing.
 */

// Only schemes that are safe to leave as a live hyperlink in a document
// somebody will open in Word. `javascript:` and `file:` are the ones worth
// keeping out.
const SAFE_LINK = /^(https?:|mailto:)/i;

/** Collapses marked's inline tokens into styled runs. */
function flattenInline(tokens, style = {}, out = []) {
  for (const token of tokens || []) {
    switch (token.type) {
      case 'strong':
        flattenInline(token.tokens, { ...style, bold: true }, out);
        break;

      case 'em':
        flattenInline(token.tokens, { ...style, italic: true }, out);
        break;

      case 'del':
        flattenInline(token.tokens, { ...style, strike: true }, out);
        break;

      case 'link': {
        const href = String(token.href || '');
        const nested = SAFE_LINK.test(href) ? { ...style, link: href } : style;
        flattenInline(token.tokens, nested, out);
        break;
      }

      case 'image':
        // Deliberately not fetched. Following a URL out of a user-supplied
        // document would make this endpoint a request proxy into whatever the
        // server can reach; the alt text carries the meaning instead.
        if (token.text) out.push({ ...style, italic: true, text: `[image: ${token.text}]` });
        break;

      case 'codespan':
        out.push({ ...style, code: true, text: token.text });
        break;

      case 'br':
        out.push({ ...style, text: '\n' });
        break;

      case 'html':
        // Raw HTML is shown as the text it literally is rather than
        // interpreted. Nothing downstream renders it, so passing it through
        // would only produce stray angle brackets in the Word file.
        out.push({ ...style, text: token.text });
        break;

      case 'escape':
      case 'text':
        if (token.tokens?.length) flattenInline(token.tokens, style, out);
        else out.push({ ...style, text: token.text });
        break;

      default:
        if (token.tokens?.length) flattenInline(token.tokens, style, out);
        else if (token.text) out.push({ ...style, text: token.text });
    }
  }

  return out;
}

function cells(row) {
  return (row || []).map((cell) => flattenInline(cell.tokens));
}

/** Walks list items, which may themselves contain paragraphs and nested lists. */
function listBlocks(token, depth, out) {
  let index = Number.isFinite(token.start) && token.start > 0 ? token.start : 1;

  for (const item of token.items || []) {
    const inline = [];
    const trailing = [];

    for (const child of item.tokens || []) {
      if (child.type === 'list') trailing.push(child);
      else if (child.type === 'text' || child.type === 'paragraph') {
        flattenInline(child.tokens || [{ type: 'text', text: child.text }], {}, inline);
      } else {
        trailing.push(child);
      }
    }

    out.push({
      type: 'list',
      ordered: Boolean(token.ordered),
      level: depth,
      number: index,
      // Word has no checkbox that survives a round trip, so a task list keeps
      // its state as the symbol a reader expects to see.
      task: item.task ? (item.checked ? '☑' : '☐') : null,
      runs: inline
    });

    index += 1;

    for (const child of trailing) {
      if (child.type === 'list') listBlocks(child, depth + 1, out);
      else blocksFromTokens([child], out, depth + 1);
    }
  }
}

function blocksFromTokens(tokens, out = [], depth = 0) {
  for (const token of tokens || []) {
    switch (token.type) {
      case 'heading':
        out.push({ type: 'heading', level: Math.min(6, token.depth || 1), runs: flattenInline(token.tokens) });
        break;

      case 'paragraph':
        out.push({ type: 'paragraph', runs: flattenInline(token.tokens), indent: depth });
        break;

      case 'text':
        out.push({
          type: 'paragraph',
          runs: token.tokens?.length ? flattenInline(token.tokens) : [{ text: token.text }],
          indent: depth
        });
        break;

      case 'code':
        out.push({ type: 'code', text: String(token.text || ''), language: token.lang || '' });
        break;

      case 'blockquote':
        out.push({ type: 'quote', runs: flattenInline(token.tokens?.flatMap((t) => t.tokens || []) || []) });
        break;

      case 'list':
        listBlocks(token, depth, out);
        break;

      case 'table':
        out.push({ type: 'table', header: cells(token.header), rows: (token.rows || []).map(cells) });
        break;

      case 'hr':
        out.push({ type: 'hr' });
        break;

      case 'html':
        out.push({ type: 'paragraph', runs: [{ text: String(token.text || '').trim() }], indent: depth });
        break;

      default:
        break;
    }
  }

  return out;
}

async function renderMarkdownDocx({ markdown, filename, title, subtitle, pageSize }) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    throw AppError.badRequest('Add some Markdown before converting.');
  }

  if (markdown.length > env.maxCodeChars) {
    throw AppError.payloadTooLarge(
      `The document is ${markdown.length.toLocaleString()} characters; the limit is ${env.maxCodeChars.toLocaleString()}.`
    );
  }

  const capability = await getCapability('pymupdf');

  if (!capability.available) {
    throw AppError.unavailable(capability.reason, { code: 'markdown_to_docx_unavailable' });
  }

  ensureWorkspace();

  let tokens;

  try {
    tokens = marked.lexer(markdown.replace(/\r\n?/g, '\n'), { gfm: true, breaks: false });
  } catch (error) {
    throw AppError.badRequest(`This Markdown could not be parsed: ${error.message}`);
  }

  const blocks = blocksFromTokens(tokens);

  if (!blocks.length) {
    throw AppError.badRequest('There was nothing to convert in this Markdown.');
  }

  const safeName = sanitizeBaseName(filename, 'document');
  const outputFileName = `${randomUUID()}.docx`;
  const outputPath = path.join(env.outputDir, outputFileName);
  const planPath = path.join(env.workDir, `md-docx-${randomUUID()}.json`);

  try {
    await fs.writeFile(
      planPath,
      JSON.stringify({ title: title || '', subtitle: subtitle || '', pageSize: pageSize || 'a4', blocks }),
      'utf8'
    );

    const { stdout } = await runCommand(
      capability.binary,
      [path.join(env.scriptDir, 'markdown_to_docx.py'), planPath, outputPath],
      { timeoutMs: env.ocrTimeoutMs, env: { HOME: env.workDir, PYTHONUNBUFFERED: '1' } }
    );

    const parsed = JSON.parse(stdout);

    return {
      outputPath,
      outputFileName,
      originalName: `${safeName}.docx`,
      paragraphs: parsed.paragraphs,
      headings: parsed.headings,
      tables: parsed.tables,
      listItems: parsed.listItems
    };
  } catch (error) {
    if (error instanceof AppError) throw error;

    if (error.code === 'ETIMEDOUT') {
      throw AppError.unavailable('Building this Word document took too long. Try a shorter document.');
    }

    await safeUnlink(outputPath);
    logger.error('markdown->docx failed', { error: error.message });
    throw AppError.internal('Could not build a Word document from this Markdown.');
  } finally {
    await safeUnlink(planPath);
  }
}

module.exports = { renderMarkdownDocx, blocksFromTokens, flattenInline };
