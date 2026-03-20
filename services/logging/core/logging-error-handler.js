const DEFAULT_MAX_BUFFER = 1000;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY = 100;
const DEFAULT_BACKOFF_FACTOR = 2;

class LoggingErrorHandler {
  constructor(options = {}) {
    this.buffer = [];
    this.maxBuffer = options.maxBuffer || DEFAULT_MAX_BUFFER;
    this.maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;
    this.initialDelay = options.initialDelay || DEFAULT_INITIAL_DELAY;
    this.backoffFactor = options.backoffFactor || DEFAULT_BACKOFF_FACTOR;
    this.stats = {
      buffered: 0,
      dropped: 0,
      retried: 0,
      flushed: 0
    };
  }

  async handle(logFn, level, message, context) {
    let attempt = 0;
    let delay = this.initialDelay;
    while (attempt < this.maxRetries) {
      try {
        await logFn(message, context);
        if (attempt > 0) this.stats.retried++;
        return true;
      } catch (err) {
        attempt++;
        await new Promise(res => setTimeout(res, delay));
        delay *= this.backoffFactor;
      }
    }
    // Se fallisce, bufferizza
    this.bufferLog(level, message, context);
    return false;
  }

  bufferLog(level, message, context) {
    if (this.buffer.length >= this.maxBuffer) {
      this.buffer.shift(); // Drop oldest
      this.stats.dropped++;
    }
    this.buffer.push({ level, message, context, timestamp: Date.now() });
    this.stats.buffered = this.buffer.length;
    // Fallback su console
    try {
      // eslint-disable-next-line no-console
      console.error(`[LoggingErrorHandler] Buffered log (${level}):`, message, context);
    } catch {}
  }

  async flush(flushFn) {
    let flushed = 0;
    for (const log of this.buffer) {
      try {
        await flushFn(log.level, log.message, log.context);
        flushed++;
      } catch {}
    }
    this.buffer = [];
    this.stats.flushed += flushed;
    this.stats.buffered = 0;
    return flushed;
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = LoggingErrorHandler; 