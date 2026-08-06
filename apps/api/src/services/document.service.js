'use strict';

const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const { AppError } = require('../utils/AppError');
const { logger } = require('../utils/logger');
const { runCommand } = require('../utils/runCommand');
const { sanitizeBaseName } = require('../utils/sanitizeFilename');
const { safeUnlink, safeRemoveDir } = require('../utils/fileCleanup');
const { getCapability } = require('./capabilities.service');

async function requireLibreOffice() {
  const capability = await getCapability('libreOffice');

  if (!capability.available) {
    throw AppError.unavailable(capability.reason, { code: 'libreoffice_unavailable' });
  }

  return capability.binary;
}

async function requirePython() {
  const capability = await getCapability('python');

  if (!capability.available) {
    throw AppError.unavailable(capability.reason, { code: 'pdf2docx_unavailable' });
  }

  return capability.binary;
}

/**
 * Word (.docx) -> PDF via headless LibreOffice.
 *
 * Every run gets its own `-env:UserInstallation` profile. Sharing the default
 * profile is the classic cause of "LibreOffice silently produces nothing" once
 * a second conversion overlaps or a previous run left a stale lock behind.
 */
async function convertDocxToPdf({ inputPath, originalBaseName }) {
  const binary = await requireLibreOffice();
  const runId = randomUUID();
  const tempDir = path.join(env.workDir, `lo-${runId}`);
  const profileDir = path.join(tempDir, 'profile');
  const outDir = path.join(tempDir, 'out');

  await fs.mkdir(profileDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  try {
    const { stderr } = await runCommand(
      binary,
      [
        `-env:UserInstallation=file://${profileDir}`,
        '--headless',
        '--norestore',
        '--nologo',
        '--nolockcheck',
        '--nodefault',
        '--nofirststartwizard',
        '--convert-to',
        'pdf:writer_pdf_Export',
        '--outdir',
        outDir,
        inputPath
      ],
      { timeoutMs: env.libreOfficeTimeoutMs, env: { HOME: tempDir } }
    );

    if (stderr.trim()) {
      logger.debug('LibreOffice stderr', { stderr: stderr.trim().slice(0, 500) });
    }

    const produced = (await fs.readdir(outDir)).find((name) => name.toLowerCase().endsWith('.pdf'));

    if (!produced) {
      throw AppError.internal(
        'LibreOffice did not produce a PDF. The document may be corrupted or password protected.'
      );
    }

    const outputFileName = `${randomUUID()}.pdf`;
    const outputPath = path.join(env.outputDir, outputFileName);
    // rename() fails across devices; copy+unlink is portable.
    await fs.copyFile(path.join(outDir, produced), outputPath);

    return {
      outputPath,
      outputFileName,
      originalName: `${sanitizeBaseName(originalBaseName, 'document')}.pdf`
    };
  } catch (error) {
    if (error instanceof AppError) throw error;

    if (error.code === 'ETIMEDOUT') {
      throw AppError.unavailable('The document took too long to convert. Try a smaller or simpler file.');
    }

    logger.error('docx->pdf failed', { error: error.message });
    throw AppError.internal('Word to PDF conversion failed. Please check the document and try again.');
  } finally {
    await safeRemoveDir(tempDir);
  }
}

/** PDF -> Word (.docx) via the pdf2docx Python subprocess. */
async function convertPdfToDocx({ inputPath, originalBaseName }) {
  const python = await requirePython();
  const script = path.join(env.scriptDir, 'pdf_to_docx.py');
  const outputFileName = `${randomUUID()}.docx`;
  const outputPath = path.join(env.outputDir, outputFileName);

  try {
    await runCommand(python, [script, inputPath, outputPath, '--max-pages', String(env.pdfToDocxMaxPages)], {
      timeoutMs: env.pdfToDocxTimeoutMs,
      // Keep OpenCV/NumPy single-threaded: thread pools cost memory we don't have.
      env: {
        HOME: env.workDir,
        OMP_NUM_THREADS: '1',
        OPENBLAS_NUM_THREADS: '1',
        MKL_NUM_THREADS: '1',
        PYTHONUNBUFFERED: '1'
      }
    });

    const stats = await fs.stat(outputPath).catch(() => null);

    if (!stats || stats.size === 0) {
      throw AppError.internal('The converter produced an empty document.');
    }

    return {
      outputPath,
      outputFileName,
      originalName: `${sanitizeBaseName(originalBaseName, 'document')}.docx`
    };
  } catch (error) {
    await safeUnlink(outputPath);

    if (error instanceof AppError) throw error;

    if (error.code === 'ETIMEDOUT') {
      throw AppError.unavailable(
        'The PDF took too long to convert. Try a shorter document or one with less complex layout.'
      );
    }

    // Exit code 2 means the script rejected the input for a reason worth showing.
    if (error.exitCode === 2) {
      throw AppError.badRequest(extractScriptError(error.stderr) || 'This PDF could not be converted.');
    }

    if (error.signal === 'SIGKILL') {
      throw AppError.unavailable(
        'The server ran out of memory converting this PDF. Try a smaller file or fewer pages.'
      );
    }

    logger.error('pdf->docx failed', { error: error.message });
    throw AppError.internal('PDF to Word conversion failed. Scanned or image-only PDFs are not supported.');
  }
}

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

module.exports = { convertDocxToPdf, convertPdfToDocx };
