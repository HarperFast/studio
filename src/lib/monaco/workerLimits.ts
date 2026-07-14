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

/** The outcome of offering one acquired declaration to {@link ExtraLibBudget}. */
export interface ExtraLibAdmission {
	/** Whether the declaration was admitted (and the running total advanced). */
	admitted: boolean;
	/**
	 * Set only on the single call that first exhausts the aggregate budget, so
	 * the caller can log the transition once and short-circuit later passes.
	 */
	justExhausted: boolean;
	/**
	 * Set when the declaration was rejected solely because it exceeds the
	 * per-file limit — smaller declarations can still be admitted afterward, so
	 * this does not spend the budget.
	 */
	oversize: boolean;
}

/**
 * Session-lifetime accounting for the `@types` declarations handed to the
 * language worker as extra libs (`addExtraLib`). `setEagerModelSync(true)`
 * clones every extra lib to the worker, the model budget can't see them, and
 * they are never swept on project switch — so this is the sole bound on their
 * unbounded, cross-project accumulation (HarperFast/studio#1499).
 *
 * Kept free of any Monaco dependency so the accumulation logic is unit-testable
 * on its own. A rejected declaration degrades its package to "cannot find
 * module" — the same tradeoff `selectFilesWithinModelBudget` makes for skipped
 * sibling models — which beats crashing the worker for the whole tab.
 */
export class ExtraLibBudget {
	private totalChars = 0;
	private spent = false;

	/**
	 * Whether the aggregate budget is exhausted. Once true it stays true: the
	 * budget is never reclaimed, so a whole acquisition pass can be skipped
	 * rather than woken to walk the CDN only for every file to be rejected.
	 */
	get isSpent(): boolean {
		return this.spent;
	}

	/**
	 * Offer a declaration of `chars` characters. Admits it (advancing the running
	 * total) when it fits both the per-file and aggregate limits; otherwise
	 * reports why it was turned away. The first aggregate overflow seals the
	 * budget so every later offer is rejected without further arithmetic.
	 */
	admit(chars: number): ExtraLibAdmission {
		if (this.spent) {
			return { admitted: false, justExhausted: false, oversize: false };
		}
		if (chars > MAX_WORKER_MODEL_CHARS) {
			return { admitted: false, justExhausted: false, oversize: true };
		}
		if (this.totalChars + chars > MAX_EXTRA_LIB_CHARS_TOTAL) {
			this.spent = true;
			return { admitted: false, justExhausted: true, oversize: false };
		}
		this.totalChars += chars;
		return { admitted: true, justExhausted: false, oversize: false };
	}
}
