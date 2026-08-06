'use strict';

const { Parser } = require('htmlparser2');

/**
 * highlight.js emits nested `<span class="hljs-*">` markup. PDFKit needs flat
 * (text, class) pairs, so walk the markup once and keep a stack of the classes
 * currently in scope.
 */
function parseHighlightedTokens(highlightedHtml) {
  const tokens = [];
  const classStack = [];

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (name === 'span') {
          classStack.push(attributes.class || '');
        }
      },
      ontext(text) {
        if (!text) return;
        tokens.push({ text, cssClass: classStack.filter(Boolean).join(' ') });
      },
      onclosetag(name) {
        if (name === 'span') {
          classStack.pop();
        }
      }
    },
    { decodeEntities: true }
  );

  parser.write(highlightedHtml);
  parser.end();

  return tokens;
}

const LIGHT_THEME = {
  comment: '#6a737d',
  keyword: '#c026d3',
  string: '#0f766e',
  number: '#b45309',
  literal: '#b45309',
  title: '#1d4ed8',
  builtIn: '#0369a1',
  type: '#0369a1',
  attr: '#b45309',
  meta: '#6b7280',
  variable: '#9a3412',
  symbol: '#9a3412',
  operator: '#374151',
  base: '#111827'
};

// Order matters: hljs stacks classes (e.g. "hljs-title hljs-function"), and the
// first match here wins.
function tokenColor(cssClass) {
  const value = cssClass || '';

  if (value.includes('comment') || value.includes('quote')) return LIGHT_THEME.comment;
  if (value.includes('string') || value.includes('regexp')) return LIGHT_THEME.string;
  if (value.includes('keyword') || value.includes('selector-tag')) return LIGHT_THEME.keyword;
  if (value.includes('number') || value.includes('literal')) return LIGHT_THEME.number;
  if (value.includes('title') || value.includes('section')) return LIGHT_THEME.title;
  if (value.includes('built_in') || value.includes('type') || value.includes('class')) return LIGHT_THEME.builtIn;
  if (value.includes('attr') || value.includes('property')) return LIGHT_THEME.attr;
  if (value.includes('meta') || value.includes('doctag')) return LIGHT_THEME.meta;
  if (value.includes('variable') || value.includes('symbol') || value.includes('template')) return LIGHT_THEME.variable;
  if (value.includes('operator') || value.includes('punctuation')) return LIGHT_THEME.operator;

  return LIGHT_THEME.base;
}

function isCommentToken(cssClass) {
  return (cssClass || '').includes('comment') || (cssClass || '').includes('quote');
}

function isBoldToken(cssClass) {
  const value = cssClass || '';
  return value.includes('keyword') || value.includes('title') || value.includes('section');
}

module.exports = { parseHighlightedTokens, tokenColor, isCommentToken, isBoldToken, LIGHT_THEME };
