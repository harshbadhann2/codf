'use strict';

const { Anthropic } = require('@anthropic-ai/sdk');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { SYSTEM_PROMPT, buildUserMessage } = require('../prompts/codeExplanation');

// Whatever the model returns, this is the most we print into the PDF.
const MAX_LENGTHS = { summary: 600, approach: 1000, time: 160, space: 160 };

/** The model answered, but not with something we can use. */
class ExplanationError extends Error {}

function isConfigured() {
  return Boolean(env.llmApiKey && env.llmModel);
}

let sharedClient;

/** One client per process: it keeps its HTTP connection pool between requests. */
function defaultClient() {
  sharedClient ??= new Anthropic({ apiKey: env.llmApiKey });
  return sharedClient;
}

function requiredText(value, name, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ExplanationError(`The model response has no "${name}".`);
  }

  const text = value.trim().replace(/\s+/g, ' ');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * Turns the model's raw text into a validated explanation object.
 *
 * The prompt asks for bare JSON, but models occasionally wrap it in a ```json
 * fence anyway, so a fence is tolerated. Anything else that isn't the exact
 * shape we asked for throws, and the caller falls back to a PDF without it.
 */
function parseExplanation(rawText) {
  const text = String(rawText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new ExplanationError('The model response is not valid JSON.');
  }

  if (!data || typeof data !== 'object' || !data.complexity || typeof data.complexity !== 'object') {
    throw new ExplanationError('The model response does not have the expected shape.');
  }

  return {
    summary: requiredText(data.summary, 'summary', MAX_LENGTHS.summary),
    approach: requiredText(data.approach, 'approach', MAX_LENGTHS.approach),
    complexity: {
      time: requiredText(data.complexity.time, 'complexity.time', MAX_LENGTHS.time),
      space: requiredText(data.complexity.space, 'complexity.space', MAX_LENGTHS.space)
    }
  };
}

/** One Messages API call. Throws on any failure; `explainCode` decides what that means. */
async function requestExplanation({ code, language }, client) {
  const response = await client.messages.create({
    model: env.llmModel,
    // The JSON answer is a few hundred tokens; this leaves ample headroom.
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(code, language) }]
  });

  if (response.stop_reason !== 'end_turn') {
    throw new ExplanationError(`The model stopped early (${response.stop_reason}).`);
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return parseExplanation(text);
}

/**
 * Explains a program for the PDF. Never throws: the PDF must not depend on the
 * AI feature, so every failure becomes `{ status: 'skipped', reason }` and the
 * caller renders the document without an explanation.
 *
 * `client` is injectable so tests never reach the real API.
 */
async function explainCode({ code, language }, { client } = {}) {
  if (!isConfigured()) {
    return { status: 'skipped', reason: 'AI explanations are not configured on this server.' };
  }

  try {
    const explanation = await requestExplanation({ code, language }, client || defaultClient());
    return { status: 'included', explanation };
  } catch (error) {
    logger.warn('AI explanation failed; rendering the PDF without it', { error: error.message });
    return { status: 'skipped', reason: 'The AI explanation could not be generated.' };
  }
}

module.exports = { explainCode, parseExplanation, isConfigured, ExplanationError };
