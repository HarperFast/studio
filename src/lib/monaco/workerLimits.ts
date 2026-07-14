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

/**
 * Total-character budget for automatically-acquired `@types` declarations
 * (`addExtraLib`), across the whole session.
 *
 * `setEagerModelSync(true)` clones *both* models *and* every extra lib to the
 * language worker over `postMessage`. The model budget
 * (`MAX_APPLICATION_MODEL_CHARS_TOTAL`) only sees `file:///` models — extra libs
 * are invisible to it — and, unlike models, extra libs are never swept when the
 * open project changes, so Automatic Type Acquisition accumulates them
 * monotonically across every project opened in a session. Left unbounded, that
 * volume eventually overflows the clone buffer and crashes the worker with
 * "DataCloneError: Data cannot be cloned, out of memory." (HarperFast/studio#1499,
 * a recurrence of #1370 through the extra-lib path the model guards don't cover).
 *
 * 8 MB comfortably fits a typical app's real dependency `@types` (react,
 * react-dom, and friends) while still capping the pathological accumulation.
 */
export const MAX_EXTRA_LIB_CHARS_TOTAL = 8 * 1024 * 1024;

/**
 * Whether an acquired declaration file may be handed to the worker as an extra
 * lib, given the total chars already admitted this session. Rejects a single
 * oversized declaration and anything that would push the running total past the
 * budget. A rejected lib degrades that package to "cannot find module" — the
 * same acceptable degradation `selectFilesWithinModelBudget` chose for skipped
 * sibling models — which beats crashing the worker for the whole tab.
 */
export function canAdmitExtraLib(currentTotalChars: number, incomingChars: number): boolean {
	return incomingChars <= MAX_WORKER_MODEL_CHARS && currentTotalChars + incomingChars <= MAX_EXTRA_LIB_CHARS_TOTAL;
}
