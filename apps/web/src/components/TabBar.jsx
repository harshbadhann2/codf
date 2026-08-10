import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Segmented tab control whose highlight slides between options.
 *
 * The thumb is one absolutely positioned element animated with transform, so
 * the highlight travels — you can see where you came from — and it animates on
 * the compositor rather than repainting five buttons.
 *
 * The strip scrolls horizontally on narrow screens, which is where this was
 * previously breaking on phones. See the `.segmented` rules in index.css: the
 * short version is that a horizontal scroller has to say so explicitly, or the
 * browser treats it as a vertical one too and swallows the gesture that was
 * meant to scroll the page.
 */
/**
 * Scrolls an element horizontally with our own easing.
 *
 * `scrollTo({ behavior: 'smooth' })` is not dependable: it is a no-op in some
 * automation builds and inconsistent across Android WebViews, so a tab
 * selected off screen would simply never come into view. Driving it from
 * requestAnimationFrame works everywhere and lets the curve match the rest of
 * the interface instead of whatever the engine picked.
 */
function animateScrollTo(element, target, { duration = 420, onDone } = {}) {
  const start = element.scrollLeft;
  const delta = target - start;

  if (Math.abs(delta) < 1) {
    onDone?.();
    return () => {};
  }

  // No animation is worth running on a page nobody is looking at, and
  // requestAnimationFrame is suspended while a tab is backgrounded — so jump
  // straight to the destination rather than leaving the strip stranded.
  if (document.hidden || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    element.scrollLeft = target;
    onDone?.();
    return () => {};
  }

  let frame = 0;
  const startedAt = performance.now();
  // easeOutCubic: quick to leave, gentle to arrive.
  const ease = (t) => 1 - (1 - t) ** 3;

  const step = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    element.scrollLeft = start + delta * ease(progress);

    if (progress < 1) {
      frame = requestAnimationFrame(step);
    } else {
      frame = 0;
      onDone?.();
    }
  };

  frame = requestAnimationFrame(step);

  return () => {
    if (frame) cancelAnimationFrame(frame);
  };
}

export default function TabBar({ tabs, active, onChange }) {
  const wrapRef = useRef(null);
  const containerRef = useRef(null);
  const buttonRefs = useRef({});
  const [thumb, setThumb] = useState({ left: 0, width: 0, ready: false });

  useLayoutEffect(() => {
    const button = buttonRefs.current[active];
    const container = containerRef.current;
    if (!button || !container) return undefined;

    // offsetLeft is already in the strip's scrolled coordinate space, and an
    // absolutely positioned child scrolls along with its scroll container — so
    // no scrollLeft correction belongs here. Subtracting it (as this used to)
    // makes the thumb drift away from its tab as the strip scrolls.
    const move = () => setThumb({ left: button.offsetLeft, width: button.offsetWidth, ready: true });

    move();

    // Web fonts land after first paint and change every measurement.
    const observer = new ResizeObserver(move);
    observer.observe(container);
    observer.observe(button);

    return () => observer.disconnect();
  }, [active, tabs]);

  useEffect(() => {
    const container = containerRef.current;
    const button = buttonRefs.current[active];
    if (!container || !button) return;

    // Bring the chosen tab fully into view — on a phone the later tabs sit off
    // screen, and selecting one by keyboard should not leave it hidden.
    const left = button.offsetLeft;
    const right = left + button.offsetWidth;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;
    const pad = 16;
    let target = null;

    if (left - pad < viewLeft) {
      target = Math.max(0, left - pad);
    } else if (right + pad > viewRight) {
      target = Math.min(
        container.scrollWidth - container.clientWidth,
        right + pad - container.clientWidth
      );
    }

    if (target === null) return;
    return animateScrollTo(container, target);
  }, [active]);

  useEffect(() => {
    const container = containerRef.current;
    const wrap = wrapRef.current;
    if (!container || !wrap) return undefined;

    // Edge fades, toggled by direct class writes rather than React state: this
    // runs on every scroll frame and must not re-render the tree.
    let frame = 0;

    const update = () => {
      frame = 0;
      const maxScroll = container.scrollWidth - container.clientWidth;
      wrap.classList.toggle('has-start', container.scrollLeft > 2);
      wrap.classList.toggle('has-end', container.scrollLeft < maxScroll - 2);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    container.addEventListener('scroll', onScroll, { passive: true });

    const observer = new ResizeObserver(update);
    observer.observe(container);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      container.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [tabs]);

  function handleKeyDown(event) {
    const index = tabs.findIndex((tab) => tab.id === active);
    if (index < 0) return;

    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;

    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next].id);
    buttonRefs.current[tabs[next].id]?.focus();
  }

  return (
    <div ref={wrapRef} className="segmented-wrap">
      <div
        ref={containerRef}
        role="tablist"
        aria-label="Conversion type"
        onKeyDown={handleKeyDown}
        className="segmented no-scrollbar"
      >
        <span
          className="segmented-thumb"
          style={{
            transform: `translate3d(${thumb.left}px, 0, 0)`,
            width: `${thumb.width}px`,
            opacity: thumb.ready ? 1 : 0
          }}
        />

        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.id === active;

          return (
            <button
              key={tab.id}
              ref={(node) => {
                buttonRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className="segment focus-ring"
            >
              <Icon width={15} height={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
