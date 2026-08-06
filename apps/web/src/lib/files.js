export function bytesToMb(sizeInBytes = 0) {
  return sizeInBytes / (1024 * 1024);
}

export function formatBytes(sizeInBytes = 0) {
  if (sizeInBytes < 1024) return `${sizeInBytes} B`;
  if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(0)} KB`;
  return `${(sizeInBytes / 1024 / 1024).toFixed(1)} MB`;
}

export function extensionOf(fileName = '') {
  const match = /\.[^.]+$/.exec(fileName);
  return match ? match[0].toLowerCase() : '';
}

export function stripExtension(fileName = '') {
  return fileName.replace(/\.[^./\\]+$/, '');
}

/**
 * Client-side pre-flight. The server re-validates everything; this just avoids
 * a pointless round trip (and, on a cold free instance, a 60-second one).
 */
export function validateFile(file, allowedExtensions, maxFileSizeMb) {
  if (!file) return 'Please choose a file first.';

  const extension = extensionOf(file.name);

  if (!allowedExtensions.includes(extension)) {
    return `That is a ${extension || 'unknown'} file. Allowed here: ${allowedExtensions.join(', ')}.`;
  }

  if (file.size === 0) return 'That file is empty.';

  if (bytesToMb(file.size) > maxFileSizeMb) {
    return `That file is ${formatBytes(file.size)}; the limit is ${maxFileSizeMb} MB.`;
  }

  return '';
}

/**
 * Triggers a download without navigating away.
 *
 * Fetching as a blob keeps the tab in place and honours the filename we ask
 * for. If it fails (an expired file, or a CORS hiccup), fall back to opening
 * the URL so the user still gets their file.
 */
export async function downloadFile(url, fileName) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = objectUrl;
    anchor.download = fileName || 'download';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // Revoke on the next tick; revoking immediately cancels the download in Safari.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    return true;
  } catch {
    window.open(url, '_blank', 'noopener');
    return false;
  }
}

export function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'less than a minute';
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
