'use strict';

/**
 * Decides which rows land on which page, before anything is drawn.
 *
 * This is where "the code block is half on one page and half on the next"
 * gets fixed. The rules, in order of precedence:
 *
 *   1. A block flagged keepTogether that fits on an empty page is never split
 *      — it moves whole to the next page instead.
 *   2. A block that genuinely cannot fit on one page splits, but never leaves
 *      fewer than minOrphan rows behind or carries fewer than minWidow forward.
 *   3. A heading (keepWithNext) must be followed on the same page by at least
 *      that many rows of whatever comes after it.
 *   4. A table continuing onto a new page repeats its header row.
 *
 * Returns pages of placements; the caller draws them.
 */

function paginate(blocks, { top, bottom, left }) {
  const usable = bottom - top;
  const pages = [[]];

  let pageIndex = 0;
  let cursor = top;

  const newPage = () => {
    pages.push([]);
    pageIndex += 1;
    cursor = top;
  };

  const roomLeft = () => bottom - cursor;

  const rowsHeight = (rows, from, to) => {
    let total = 0;
    for (let index = from; index < to; index += 1) total += rows[index].height;
    return total;
  };

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const padding = block.padding || { top: 0, bottom: 0 };
    const chromeHeight = padding.top + padding.bottom;

    // Space above the block, but never as the first thing on a page — leading
    // whitespace at the top of a page is just a wonky margin.
    if (cursor > top && block.spaceBefore) {
      cursor += block.spaceBefore;
    }

    const totalHeight = rowsHeight(block.rows, 0, block.rows.length) + chromeHeight;

    // Rule 1: keep-together blocks that would fit on a fresh page.
    if (block.keepTogether && totalHeight > roomLeft() && totalHeight <= usable) {
      newPage();
    }

    // Rule 3: a heading needs its successor beneath it.
    const next = blocks[blockIndex + 1];

    if (block.keepWithNext && next) {
      const nextChrome = (next.padding?.top || 0) + (next.padding?.bottom || 0);
      const nextFull = rowsHeight(next.rows, 0, next.rows.length) + nextChrome;
      const nextOpening = rowsHeight(next.rows, 0, Math.min(block.keepWithNext, next.rows.length));

      // A keep-together successor moves as a unit, so "will its first two rows
      // fit here?" is the wrong question — the honest one is whether the whole
      // thing fits. Asking the easy question is what left a heading alone at
      // the foot of the page while its code block jumped to the next one.
      const requirement = next.keepTogether && nextFull <= usable ? nextFull : nextOpening;
      const needed = totalHeight + (next.spaceBefore || 0) + requirement;

      if (needed > roomLeft() && needed <= usable) {
        newPage();
      }
    }

    let rowIndex = 0;
    let isFirstSlice = true;

    while (rowIndex < block.rows.length) {
      const available = roomLeft() - chromeHeight;
      let fit = 0;
      let used = 0;

      while (rowIndex + fit < block.rows.length && used + block.rows[rowIndex + fit].height <= available) {
        used += block.rows[rowIndex + fit].height;
        fit += 1;
      }

      const remaining = block.rows.length - rowIndex;

      // Rule 2: refuse breaks that would strand a line or two.
      if (fit > 0 && fit < remaining) {
        const minOrphan = block.minOrphan || 1;
        const minWidow = block.minWidow || 1;

        if (fit < minOrphan || remaining - fit < minWidow) {
          fit = 0;
        }
      }

      if (fit === 0) {
        if (cursor === top) {
          // Nothing fits even on an empty page: place one row and move on, or
          // the loop never terminates.
          fit = 1;
          used = block.rows[rowIndex].height;
        } else {
          newPage();
          continue;
        }
      }

      const sliceHeight = used + (isFirstSlice ? padding.top : 0) + (rowIndex + fit >= block.rows.length ? padding.bottom : 0);

      pages[pageIndex].push({
        block,
        rowStart: rowIndex,
        rowEnd: rowIndex + fit,
        x: left + (block.indent || 0),
        y: cursor,
        height: sliceHeight,
        contentY: cursor + (isFirstSlice ? padding.top : 0),
        isFirst: isFirstSlice,
        isLast: rowIndex + fit >= block.rows.length
      });

      cursor += sliceHeight;
      rowIndex += fit;
      isFirstSlice = false;

      if (rowIndex < block.rows.length) {
        newPage();

        // Rule 4: repeat the header on a continued table.
        if (block.repeatFirstRow && block.rows.length) {
          const header = block.rows[0];
          pages[pageIndex].push({
            block,
            rowStart: 0,
            rowEnd: 1,
            x: left + (block.indent || 0),
            y: cursor,
            height: header.height + padding.top,
            contentY: cursor + padding.top,
            isFirst: true,
            isLast: false,
            repeated: true
          });
          cursor += header.height + padding.top;
        }
      }
    }

    if (block.spaceAfter) cursor += block.spaceAfter;
  }

  return pages;
}

module.exports = { paginate };
