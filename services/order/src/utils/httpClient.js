import axios from 'axios';
import logger from './logger.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class CircuitBreaker {
  constructor({ failureThresholdPercent = 0.5, minRequests = 10, recoveryTimeMs = 30000, successThreshold = 1 } = {}) {
    this.failureThresholdPercent = failureThresholdPercent; // e.g. 0.5 for 50%
    this.minRequests = minRequests; // minimum requests before evaluating failure rate
    this.recoveryTimeMs = recoveryTimeMs; // ms to wait before HALF_OPEN
    this.successThreshold = successThreshold; // number of successes in half open to close

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.nextAttempt = 0;
  }

  allowRequest() {
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttempt) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true;
  }

  onSuccess() {
    this.requestCount += 1;
    if (this.state === 'HALF_OPEN') {
      this.successCount += 1;
      if (this.successCount >= this.successThreshold) {
        this._reset();
      }
    } else {
      // reset counters on success in CLOSED
      this.failureCount = 0;
      this.successCount = 0;
      // keep requestCount rolling
    }
  }

  onFailure() {
    this.requestCount += 1;
    this.failureCount += 1;
    // Only evaluate threshold after minimum requests collected
    if (this.requestCount >= this.minRequests) {
      const failRatio = this.failureCount / this.requestCount;
      if (failRatio >= this.failureThresholdPercent) {
        this.state = 'OPEN';
        this.nextAttempt = Date.now() + this.recoveryTimeMs;
        this.successCount = 0;
      }
    }
  }

  _reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.nextAttempt = 0;
  }
}

const breakers = new Map();

function getBreaker(key, config) {
  if (!breakers.has(key)) {
    breakers.set(key, new CircuitBreaker(config));
  }
  return breakers.get(key);
}

export async function requestWithRetry(baseUrl, config = {}, options = {}) {
  // options: attempts (total attempts, including initial), initialBackoffMs, jitterPercent, breakerConfig
  const { attempts = 4, initialBackoffMs = 1000, jitterPercent = 0.3, breakerConfig = {} } = options;
  const breaker = getBreaker(baseUrl, breakerConfig);

  if (!breaker.allowRequest()) {
    const err = new Error('Circuit is open for ' + baseUrl);
    err.code = 'EOPEN';
    throw err;
  }

  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const requestCfg = { baseURL: baseUrl, timeout: config.timeout || 3000, ...config };
      const resp = await axios(requestCfg);
      breaker.onSuccess();
      logger.info({ baseUrl, url: config.url, method: config.method }, 'HTTP request succeeded');
      return resp;
    } catch (err) {
      lastErr = err;
      // Only mark failure for circuit breaker on network/timeouts/5xx
      const status = err.response && err.response.status;
      const isNetworkError = !err.response || err.code === 'ECONNABORTED' || ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(err.code);
      const isServerError = status >= 500 && status < 600;
      const shouldConsiderFailure = isNetworkError || isServerError;
      if (shouldConsiderFailure) {
        breaker.onFailure();
      }

      logger.warn({ baseUrl, url: config.url, method: config.method, err: err.message, status }, 'HTTP request failed');

      // decide whether to retry
      const shouldRetry = i < attempts - 1 && (isNetworkError || isServerError);
      if (!shouldRetry) break;

      // exponential backoff with jitter (± jitterPercent)
      const baseDelay = initialBackoffMs * Math.pow(2, i); // 1s, 2s, 4s
      const jitter = Math.floor(baseDelay * jitterPercent);
      const delay = baseDelay - jitter + Math.floor(Math.random() * (2 * jitter + 1));
      await sleep(delay);
    }
  }

  throw lastErr;
}

export function getCircuitStatus() {
  const out = {};
  for (const [key, br] of breakers.entries()) {
    out[key] = {
      state: br.state,
      failureCount: br.failureCount,
      successCount: br.successCount,
      nextAttempt: br.nextAttempt
    };
  }
  return out;
}

export default { requestWithRetry, getCircuitStatus };
