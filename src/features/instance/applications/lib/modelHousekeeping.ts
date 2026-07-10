/**
 * Model housekeeping for the Applications editor (HarperFast/studio#1407).
 *
 * Every live Monaco text model registers listeners on shared editor singletons
 * — once ~200 models are alive at the same time Monaco prints "potential
 * listener LEAK detected" (and again every +100) — and each model's full text
 * is eagerly structured-cloned to the language workers (`setEagerModelSync`),
 * where enough total volume crashes the worker with "DataCloneError: Data
 * cannot be cloned, out of memory.". These helpers keep the model population
 * bounded:
 *
 *   - `selectFilesWithinModelBudget` caps how many sibling models
 *     `useApplicationTypeIntelligence` registers, by live model count and by
 *     total characters across live models.
 *   - `sweepStaleApplicationModels` disposes `file:///` models outside the
 *     kept URI prefix that are not attached to an editor — the models that
 *     `keepCurrentModel` and cross-project navigation would otherwise leave
 *     behind forever.
 *   - `enforceModelCeiling` holds the total live `file:///` model population
 *     at the ceiling as editors create models of their own (browsing files
 *     the budget skipped, peeked library declarations), which no batch budget
 *     can see coming.
 */

/**
 * Ceiling for live `file:///` models, tab-wide. Monaco's listener-leak
 * warning fires at 200 live models; 150 leaves headroom for the open file,
 * `inmemory://` editors elsewhere on the page, and transient churn.
 */
export const MAX_LIVE_APPLICATION_MODELS = 150;

/**
 * Total-character budget across live `file:///` models, so the eager worker
 * sync can't accumulate an out-of-memory clone volume even when every
 * individual file is under `MAX_WORKER_MODEL_CHARS`.
 */
export const MAX_APPLICATION_MODEL_CHARS_TOTAL = 4 * 1024 * 1024;

export interface SiblingFileLike {
	content: string;
}

/**
 * Pick which sibling files fit within the model budget, given how many models
 * are already alive and how many characters they already hold. Files that
 * don't fit are skipped (not truncated) — a skipped sibling degrades to
 * "cannot find module" for its importers, which beats degrading the whole tab.
 */
export function selectFilesWithinModelBudget<T extends SiblingFileLike>(
	files: readonly T[],
	alreadyLiveModels: number,
	alreadyLiveChars: number,
): { selected: T[]; dropped: number } {
	const selected: T[] = [];
	let dropped = 0;
	let liveModels = alreadyLiveModels;
	let totalChars = alreadyLiveChars;
	for (const file of files) {
		if (
			liveModels >= MAX_LIVE_APPLICATION_MODELS
			|| totalChars + file.content.length > MAX_APPLICATION_MODEL_CHARS_TOTAL
		) {
			dropped++;
			continue;
		}
		selected.push(file);
		liveModels++;
		totalChars += file.content.length;
	}
	return { selected, dropped };
}

/** The slice of `monaco.editor.ITextModel` the sweep needs (kept minimal for testing). */
export interface ApplicationModelLike {
	uri: { toString(): string };
	isAttachedToEditor(): boolean;
	dispose(): void;
}

/**
 * Dispose every `file:///` model that is not attached to an editor and does
 * not start with `keepPrefix`. Non-`file` schemes (`inmemory://` modals, the
 * config editor, …) are never touched. Returns how many models were disposed.
 *
 * `keepPrefix` must be built with `monaco.Uri` (see `projectUriPrefix` in
 * `useApplicationTypeIntelligence`): `uri.toString()` percent-encodes, so a
 * raw string literal would never match a name that needs encoding.
 */
export function sweepStaleApplicationModels(
	models: readonly ApplicationModelLike[],
	keepPrefix: string | undefined,
): number {
	let swept = 0;
	for (const model of models) {
		const uri = model.uri.toString();
		if (!uri.startsWith('file:///')) {
			continue;
		}
		if (keepPrefix && uri.startsWith(keepPrefix)) {
			continue;
		}
		if (model.isAttachedToEditor()) {
			continue;
		}
		model.dispose();
		swept++;
	}
	return swept;
}

/**
 * Hold the live `file:///` model population at `ceiling` as models are
 * created outside the budgeted registration pass — the editor makes models of
 * its own for files the budget skipped and for peeked library declarations,
 * so browsing many files within one project would otherwise grow the
 * population without bound (no context switch ever triggers a sweep).
 *
 * Called from an `onDidCreateModel` listener: retires detached models in the
 * order `getModels()` returns them — Monaco preserves model-creation order, so
 * that is effectively oldest-first — and never touches the just-created model
 * (it is still detached at creation time) or anything attached to an editor.
 * Returns how many models were disposed.
 *
 * The per-call `filter` is an O(live-models) pass, bounded by the ceiling
 * (150), so it stays sub-millisecond; a running counter would scale better if
 * the ceiling is ever raised substantially, but isn't worth the extra state
 * (models are also disposed from the sweep and by Monaco itself) here.
 */
export function enforceModelCeiling(
	models: readonly ApplicationModelLike[],
	justCreatedUri: string,
	ceiling: number,
): number {
	const fileModels = models.filter(model => model.uri.toString().startsWith('file:///'));
	let excess = fileModels.length - ceiling;
	if (excess <= 0) {
		return 0;
	}
	let swept = 0;
	for (const model of fileModels) {
		if (excess <= 0) {
			break;
		}
		if (model.uri.toString() === justCreatedUri || model.isAttachedToEditor()) {
			continue;
		}
		model.dispose();
		excess--;
		swept++;
	}
	return swept;
}
