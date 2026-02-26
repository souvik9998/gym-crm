/**
 * Network Utilities for Mobile Network Resilience
 * 
 * Provides timeout wrappers and retry logic to prevent the app
 * from hanging on slow/unstable mobile networks (3G/4G/5G).
 */

const DEFAULT_TIMEOUT_MS = 15000; // 15 seconds
const AUTH_TIMEOUT_MS = 12000; // 12 seconds for auth calls
const SHORT_TIMEOUT_MS = 8000; // 8 seconds for quick calls

/**
 * Wrap any promise with a timeout. Rejects with a clear error if the
 * promise doesn't resolve within the given time.
 */
export function withTimeout<T>(
  promiseOrThenable: Promise<T> | PromiseLike<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  label: string = "Request"
): Promise<T> {
  const promise = Promise.resolve(promiseOrThenable);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s. Please check your network connection and try again.`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Retry a function up to `maxRetries` times with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 1,
  baseDelayMs: number = 1000,
  label: string = "Request"
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[${label}] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, error.message);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error(`${label} failed after ${maxRetries + 1} attempts`);
}

/**
 * Combined timeout + retry for network calls
 */
export function resilientCall<T>(
  fn: () => Promise<T>,
  options: {
    timeoutMs?: number;
    retries?: number;
    retryDelayMs?: number;
    label?: string;
  } = {}
): Promise<T> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 1,
    retryDelayMs = 1500,
    label = "Request",
  } = options;

  return withRetry(
    () => withTimeout(fn(), timeoutMs, label),
    retries,
    retryDelayMs,
    label
  );
}

export { DEFAULT_TIMEOUT_MS, AUTH_TIMEOUT_MS, SHORT_TIMEOUT_MS };
