/**
 * API client.
 *
 * Uses `fetch` + XHR rather than axios: XHR is the only way to get real upload
 * progress, and fetch covers everything else. That drops a dependency the
 * bundle does not need.
 */

/**
 * Normalises whatever is in VITE_API_BASE_URL into a usable `/api` root.
 *
 * Accepts a bare origin, an origin with a trailing slash, an origin that
 * already ends in `/api`, or nothing at all (which means "same origin", i.e.
 * the Vite dev proxy). A trailing slash here used to produce `//api/...`.
 */
export function normalizeApiBaseUrl(rawBaseUrl) {
  const value = String(rawBaseUrl || '').trim().replace(/\/+$/, '');

  if (!value) return '/api';
  if (value === '/api' || value === 'api') return '/api';
  if (value.endsWith('/api')) return value;
  if (/^https?:\/\//.test(value) || value.startsWith('/')) return `${value}/api`;

  // Someone wrote "my-api.onrender.com" without a scheme.
  return `https://${value}/api`;
}

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

/** True when the API lives on a different origin (Render) than the app (Vercel). */
export const IS_CROSS_ORIGIN = /^https?:\/\//.test(API_BASE_URL);

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network_error', requestId, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

function messageForStatus(status) {
  if (status === 0) return 'Could not reach the server. Check your connection and try again.';
  if (status === 413) return 'That file is too large.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status === 503) return 'The server is busy or that feature is unavailable right now.';
  if (status >= 500) return 'The server hit an error. Please try again.';
  return 'The request failed.';
}

function toApiError(status, payload) {
  const error = payload && typeof payload === 'object' ? payload.error : null;

  return new ApiError(error?.message || messageForStatus(status), {
    status,
    code: error?.code || 'request_failed',
    requestId: error?.requestId,
    details: error?.details
  });
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** GET returning parsed JSON. `timeoutMs` guards against a sleeping server. */
export async function apiGet(path, { timeoutMs = 15000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Chain an externally supplied signal onto our timeout controller.
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    const payload = await parseJson(response);

    if (!response.ok) throw toApiError(response.status, payload);
    return payload?.data ?? payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      throw new ApiError('The server did not respond in time.', { code: 'timeout' });
    }
    throw new ApiError('Could not reach the server.', { code: 'network_error' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** POST a JSON body. */
export async function apiPostJson(path, body, { timeoutMs = 180000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const payload = await parseJson(response);

    if (!response.ok) throw toApiError(response.status, payload);
    return payload.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      throw new ApiError('The conversion timed out. The server may be waking up — try again.', { code: 'timeout' });
    }
    throw new ApiError('Could not reach the server.', { code: 'network_error' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * POST multipart form data with upload progress.
 *
 * fetch() still cannot report request-body progress in browsers, so uploads go
 * through XMLHttpRequest. Returns an object carrying `abort` so the UI can
 * cancel a large upload.
 */
export function apiPostForm(path, formData, { onProgress, timeoutMs = 180000 } = {}) {
  const xhr = new XMLHttpRequest();

  const promise = new Promise((resolve, reject) => {
    xhr.open('POST', `${API_BASE_URL}${path}`);
    xhr.responseType = 'json';
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress((event.loaded / event.total) * 100);
    });

    xhr.addEventListener('load', () => {
      const payload = xhr.response;

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload?.data ?? payload);
        return;
      }

      reject(toApiError(xhr.status, payload));
    });

    xhr.addEventListener('error', () => {
      // status 0 on a cross-origin request is almost always a CORS rejection,
      // which the browser deliberately hides from JavaScript.
      reject(
        new ApiError(
          IS_CROSS_ORIGIN
            ? 'Could not reach the API. If this keeps happening, the server may not allow requests from this site (CORS).'
            : 'Could not reach the API.',
          { code: 'network_error' }
        )
      );
    });

    xhr.addEventListener('timeout', () => {
      reject(new ApiError('The upload timed out. Try a smaller file.', { code: 'timeout' }));
    });

    xhr.addEventListener('abort', () => {
      reject(new ApiError('Conversion cancelled.', { code: 'aborted' }));
    });

    xhr.send(formData);
  });

  promise.abort = () => xhr.abort();
  return promise;
}
