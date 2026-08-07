import { useEffect, useRef } from 'react';

/**
 * Adds `is-visible` to elements marked `.reveal` once they scroll into view.
 *
 * An observer rather than a scroll handler, so nothing runs on the main thread
 * between intersections. Elements are unobserved after revealing — this is an
 * entrance, not a state to maintain.
 */
export function useReveal(deps = []) {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const targets = root.querySelectorAll('.reveal:not(.is-visible)');
    if (!targets.length) return undefined;

    // Without IntersectionObserver, show everything rather than hide it.
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((node) => node.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );

    targets.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return rootRef;
}
