import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHealth } from '../api/conversions';

// Render's free tier stops the container after ~15 minutes idle; the next
// request has to boot it again, which routinely takes 30-60 seconds. Polling
// with a short per-attempt timeout lets the UI say "waking up" instead of
// leaving the user staring at a dead form.
const FIRST_ATTEMPT_TIMEOUT_MS = 6000;
const WAKE_ATTEMPT_TIMEOUT_MS = 12000;
const MAX_WAKE_ATTEMPTS = 8;
const RETRY_DELAY_MS = 2500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tracks whether the API is reachable and what it can do.
 *
 * status: 'checking' → first probe | 'waking' → retrying a cold start
 *         'online'   → reachable   | 'offline' → gave up
 */
export function useServerStatus() {
  const [status, setStatus] = useState('checking');
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const cancelledRef = useRef(false);

  const probe = useCallback(async () => {
    cancelledRef.current = false;
    setStatus('checking');
    setError('');
    setAttempt(0);

    for (let tries = 0; tries < MAX_WAKE_ATTEMPTS; tries += 1) {
      if (cancelledRef.current) return;

      try {
        const data = await fetchHealth({
          timeoutMs: tries === 0 ? FIRST_ATTEMPT_TIMEOUT_MS : WAKE_ATTEMPT_TIMEOUT_MS
        });

        if (cancelledRef.current) return;

        setHealth(data);
        setStatus('online');
        setError('');
        return;
      } catch (caught) {
        if (cancelledRef.current) return;

        setAttempt(tries + 1);
        setStatus('waking');
        setError(caught.message);

        if (tries < MAX_WAKE_ATTEMPTS - 1) await sleep(RETRY_DELAY_MS);
      }
    }

    if (!cancelledRef.current) setStatus('offline');
  }, []);

  useEffect(() => {
    probe();

    return () => {
      cancelledRef.current = true;
    };
  }, [probe]);

  // A capability is treated as available until proven otherwise, so a health
  // check that never lands doesn't disable the whole app.
  const can = useCallback(
    (name) => {
      if (!health?.capabilities) return true;
      return health.capabilities[name]?.available !== false;
    },
    [health]
  );

  const reasonFor = useCallback(
    (name) => health?.capabilities?.[name]?.reason || '',
    [health]
  );

  return { status, health, error, attempt, retry: probe, can, reasonFor };
}
