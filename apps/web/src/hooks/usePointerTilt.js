import { useEffect, useRef } from 'react';

/**
 * Tips an element slightly toward the pointer, and tracks the pointer position
 * as CSS variables so a highlight can follow it.
 *
 * Applied only where a fine pointer exists: on a touch screen there is nothing
 * to follow, and the transform would just cost a repaint. Values are written
 * straight to style rather than through React state so this never re-renders
 * the tree on mouse move.
 */
export function usePointerTilt({ max = 5 } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!fine || still) return undefined;

    let frame = 0;

    const onMove = (event) => {
      if (frame) return;

      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = node.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;

        node.style.setProperty('--tilt-x', `${(0.5 - py) * max * 2}deg`);
        node.style.setProperty('--tilt-y', `${(px - 0.5) * max * 2}deg`);
        node.style.setProperty('--spot-x', `${px * 100}%`);
        node.style.setProperty('--spot-y', `${py * 100}%`);
      });
    };

    const onLeave = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      node.style.setProperty('--tilt-x', '0deg');
      node.style.setProperty('--tilt-y', '0deg');
    };

    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerleave', onLeave);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
    };
  }, [max]);

  return ref;
}
