'use strict';

const { AppError } = require('./AppError');
const { env } = require('../config/env');
const { logger } = require('./logger');

/**
 * A tiny concurrency gate for expensive conversions.
 *
 * Render's free instance has 512 MB. One LibreOffice or PyMuPDF process fits
 * comfortably; two do not. Rather than let the kernel OOM-kill the whole
 * container (which drops every in-flight request, not just the greedy one),
 * heavy work is serialised here and callers past `maxQueued` get a clean 503.
 */
class JobQueue {
  constructor({ concurrency, maxQueued, queueTimeoutMs }) {
    this.concurrency = Math.max(1, concurrency);
    this.maxQueued = Math.max(0, maxQueued);
    this.queueTimeoutMs = queueTimeoutMs;
    this.active = 0;
    this.waiting = [];
  }

  get stats() {
    return { active: this.active, queued: this.waiting.length, concurrency: this.concurrency };
  }

  run(label, task) {
    return new Promise((resolve, reject) => {
      if (this.active >= this.concurrency && this.waiting.length >= this.maxQueued) {
        reject(
          AppError.unavailable(
            'The converter is busy right now. Please try again in a few seconds.',
            { code: 'queue_full' }
          )
        );
        return;
      }

      const entry = { label, task, resolve, reject, timer: null, cancelled: false };

      if (this.active < this.concurrency) {
        this.#start(entry);
        return;
      }

      entry.timer = setTimeout(() => {
        entry.cancelled = true;
        this.waiting = this.waiting.filter((item) => item !== entry);
        reject(
          AppError.unavailable(
            'Timed out waiting for a free conversion slot. Please try again.',
            { code: 'queue_timeout' }
          )
        );
      }, this.queueTimeoutMs);
      entry.timer.unref();

      this.waiting.push(entry);
      logger.debug('Job queued', { label, ...this.stats });
    });
  }

  #start(entry) {
    if (entry.cancelled) return;
    if (entry.timer) clearTimeout(entry.timer);

    this.active += 1;
    const startedAt = Date.now();

    Promise.resolve()
      .then(() => entry.task())
      .then(
        (value) => {
          logger.debug('Job finished', { label: entry.label, durationMs: Date.now() - startedAt });
          entry.resolve(value);
        },
        (error) => entry.reject(error)
      )
      .finally(() => {
        this.active -= 1;
        this.#drain();
      });
  }

  #drain() {
    while (this.active < this.concurrency && this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (next && !next.cancelled) this.#start(next);
    }
  }
}

const conversionQueue = new JobQueue({
  concurrency: env.maxConcurrentJobs,
  maxQueued: env.maxQueuedJobs,
  queueTimeoutMs: env.jobQueueTimeoutMs
});

module.exports = { JobQueue, conversionQueue };
