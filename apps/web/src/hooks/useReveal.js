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

    let fired = false;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          fired = true;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );

    targets.forEach((node) => observer.observe(node));

    // Failsafe. The observer can exist and still never call back — a tab that
    // was prerendered or backgrounded, some in-app webviews — and the failure
    // mode is the worst one available: a blank page, because every section is
    // waiting at opacity 0 for a callback that is not coming. Something above
    // the fold always intersects immediately here, so nothing having fired by
    // now means the observer is not working; show everything and stop relying
    // on it. Content being visible beats its entrance animation.
    const failsafe = setTimeout(() => {
      if (fired) return;
      targets.forEach((node) => node.classList.add('is-visible'));
      observer.disconnect();
    }, 1200);

    return () => {
      clearTimeout(failsafe);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return rootRef;
}
