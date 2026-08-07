import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Segmented tab control whose highlight slides between options.
 *
 * The thumb is one absolutely positioned element animated with transform and
 * width, rather than a background on each button. That way the highlight
 * travels — which tells you where you came from — and it animates on the
 * compositor instead of repainting four buttons.
 */
export default function TabBar({ tabs, active, onChange }) {
  const containerRef = useRef(null);
  const buttonRefs = useRef({});
  const [thumb, setThumb] = useState({ left: 0, width: 0, ready: false });

  useLayoutEffect(() => {
    const button = buttonRefs.current[active];
    const container = containerRef.current;
    if (!button || !container) return;

    const move = () =>
      setThumb({
        left: button.offsetLeft - container.scrollLeft,
        width: button.offsetWidth,
        ready: true
      });

    move();

    // Fonts land after first paint and change the measurements underneath us.
    const observer = new ResizeObserver(move);
    observer.observe(container);
    observer.observe(button);

    return () => observer.disconnect();
  }, [active, tabs]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    // Keep the thumb aligned when the strip scrolls horizontally on a phone.
    const onScroll = () => {
      const button = buttonRefs.current[active];
      if (button) setThumb((current) => ({ ...current, left: button.offsetLeft - container.scrollLeft }));
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [active]);

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
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Conversion type"
      onKeyDown={handleKeyDown}
      className="segmented segmented-scroll no-scrollbar w-full overflow-x-auto sm:w-auto"
    >
      <span
        className="segmented-thumb"
        style={{
          transform: `translateX(${thumb.left}px)`,
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
  );
}
