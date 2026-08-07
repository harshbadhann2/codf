import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

const THEME_KEY = 'codf-theme';

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Private browsing can make localStorage throw on access.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');

    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Not being able to persist the choice is not worth surfacing.
    }
  }, [theme]);

  /**
   * Switches theme with a circular wipe spreading from wherever it was
   * triggered.
   *
   * The View Transitions API snapshots the old frame, so the new theme can be
   * revealed through an expanding clip-path instead of the whole page swapping
   * colour at once. Browsers without it (Firefox today) get the plain switch —
   * the feature detect is the fallback, no polyfill needed.
   */
  const toggleTheme = useCallback((event) => {
    const next = theme === 'dark' ? 'light' : 'dark';

    if (!document.startViewTransition || prefersReducedMotion()) {
      setTheme(next);
      return;
    }

    // Origin of the wipe: the control that was clicked, or the centre.
    const target = event?.currentTarget?.getBoundingClientRect?.();
    const x = target ? target.left + target.width / 2 : window.innerWidth / 2;
    const y = target ? target.top + target.height / 2 : window.innerHeight / 2;

    // Reach the furthest corner so the wipe always covers the viewport.
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = document.startViewTransition(() => {
      // The DOM must be updated synchronously inside this callback, or the
      // API snapshots the old state twice and nothing appears to change.
      flushSync(() => setTheme(next));
    });

    // Starting a transition while one is running aborts the first, rejecting
    // its promises. The theme has already changed by then, so there is nothing
    // to recover — these handlers exist only to keep an impatient double-click
    // from logging unhandled rejections.
    transition.finished.catch(() => {});
    transition.updateCallbackDone.catch(() => {});

    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]
          },
          {
            duration: 620,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            pseudoElement: '::view-transition-new(root)'
          }
        );
      })
      .catch(() => {
        // An interrupted transition is not worth reporting; the theme still
        // changed because flushSync already ran.
      });
  }, [theme]);

  return { theme, toggleTheme };
}
