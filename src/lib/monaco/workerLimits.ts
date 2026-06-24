/**
 * Shared limit for content handed to Monaco's worker-backed languages.
 *
 * Monaco clones a model's full text to its language worker over `postMessage`
 * (a structured clone), and the TypeScript/JavaScript defaults sync eagerly via
 * `setEagerModelSync(true)`. A very large model can overflow the clone buffer and
 * crash the worker with "DataCloneError: Data cannot be cloned, out of memory.",
 * which Monaco 0.55 reports as an unhandled error (and follows with a second
 * "FAILED to post message to worker") — flooding the session with errors and
 * leaving the worker stuck. Even short of crashing, a huge model bloats worker
 * memory and slows the language service.
 *
 * Content past this size should be rendered as `plaintext` (which has no language
 * worker) instead. Real source files and log entries never approach this; the
 * inputs that do are checked-in bundles, generated data, or pathological log
 * payloads that add nothing to highlighting or IntelliSense.
 */
export const MAX_WORKER_MODEL_CHARS = 512 * 1024;
