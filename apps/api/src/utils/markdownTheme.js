'use strict';

/**
 * Page themes for Markdown → PDF.
 *
 * Two complete palettes rather than one inverted at render time: a dark page
 * needs different syntax hues to stay legible, and simply flipping a light
 * theme produces the muddy, low-contrast result that makes dark PDFs look
 * cheap. Each palette is tuned on its own background.
 */

const LIGHT = {
  name: 'light',
  page: '#ffffff',
  text: '#1f2430',
  heading: '#0b1220',
  muted: '#5c6675',
  rule: '#e3e8ef',
  ruleStrong: '#cbd5e1',

  link: '#0d7d72',
  linkUnderline: '#9dd3cd',

  codeBg: '#f7f9fc',
  codeBorder: '#e3e8ef',
  codeGutter: '#9aa5b4',
  inlineCodeBg: '#eef2f7',
  inlineCodeText: '#b3286a',

  quoteBar: '#0d7d72',
  quoteBg: '#f4faf9',
  quoteText: '#3d4757',

  tableHeaderBg: '#f2f5f9',
  tableHeaderText: '#0b1220',
  tableBorder: '#dfe5ee',
  tableStripe: '#fafbfd',

  chipBg: '#eef2f7',
  chipText: '#5c6675',

  syntax: {
    comment: '#7a8798',
    keyword: '#b3286a',
    string: '#0a7b58',
    number: '#b45309',
    title: '#1d4ed8',
    builtIn: '#0369a1',
    attr: '#b45309',
    meta: '#6b7280',
    variable: '#9a3412',
    operator: '#414b5a',
    base: '#1f2430'
  }
};

const DARK = {
  name: 'dark',
  // Slightly warm near-black. Pure #000 blooms on screens and burns ink if
  // anybody actually prints it.
  page: '#0f141c',
  text: '#dbe3ee',
  heading: '#f4f8fd',
  muted: '#94a1b3',
  rule: '#252d3a',
  ruleStrong: '#333d4d',

  link: '#4fd6c0',
  linkUnderline: '#2c7f75',

  codeBg: '#161d27',
  codeBorder: '#252d3a',
  codeGutter: '#5c6779',
  inlineCodeBg: '#1c242f',
  inlineCodeText: '#ff9ec4',

  quoteBar: '#4fd6c0',
  quoteBg: '#141c24',
  quoteText: '#c2ccdb',

  tableHeaderBg: '#1a222d',
  tableHeaderText: '#f4f8fd',
  tableBorder: '#2a3341',
  tableStripe: '#131a23',

  chipBg: '#1c242f',
  chipText: '#94a1b3',

  syntax: {
    comment: '#6b7789',
    keyword: '#ff9ec4',
    string: '#7ee0a8',
    number: '#ffc078',
    title: '#8ab4ff',
    builtIn: '#6fd3f2',
    attr: '#ffc078',
    meta: '#8b96a8',
    variable: '#ffa898',
    operator: '#aab4c3',
    base: '#dbe3ee'
  }
};

const THEMES = { light: LIGHT, dark: DARK };

function resolveTheme(name) {
  return THEMES[String(name || '').toLowerCase()] || LIGHT;
}

/** Page geometry, in points. */
const PAGE_SIZES = {
  a4: { size: 'A4', width: 595.28, height: 841.89 },
  letter: { size: 'LETTER', width: 612, height: 792 }
};

function resolvePageSize(name) {
  return PAGE_SIZES[String(name || '').toLowerCase()] || PAGE_SIZES.a4;
}

module.exports = { THEMES, resolveTheme, PAGE_SIZES, resolvePageSize };
