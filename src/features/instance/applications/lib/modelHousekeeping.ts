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
 *     `useApplicationTypeIntelligence` registers for one project, by model
 *     count and by total characters.
 *   - `sweepStaleApplicationModels` disposes `file:///` models that no longer
 *     belong to the active project and are not attached to an editor — the
 *     models that `keepCurrentModel` and cross-project navigation would
 *     otherwise leave behind forever.
 */

/**
 * Ceiling for sibling models registered per project, counting the project
 * models already alive. Monaco's listener-leak warning fires at 200 live
 * models; 150 leaves headroom for the open file, models the editor creates on
 * its own (e.g. peeked library declarations), and other editors on the page.
 */
export const MAX_PROJECT_SIBLING_MODELS = 150;

/**
 * Total-character budget across one project's registered sibling models, so
 * the eager worker sync can't accumulate an out-of-memory clone volume even
 * when every individual file is under `MAX_WORKER_MODEL_CHARS`.
 */
export const MAX_SIBLING_MODEL_CHARS_TOTAL = 4 * 1024 * 1024;

export interface SiblingFileLike {
	content: string;
}

/**
 * Pick which sibling files fit within the model budget, given how many project
 * models are already alive. Files that don't fit are skipped (not truncated) —
 * a skipped sibling degrades to "cannot find module" for its importers, which
 * beats degrading the whole tab.
 */
export function selectFilesWithinModelBudget<T extends SiblingFileLike>(
	files: readonly T[],
	alreadyLiveModels: number,
): { selected: T[]; dropped: number } {
	const selected: T[] = [];
	let dropped = 0;
	let liveModels = alreadyLiveModels;
	let totalChars = 0;
	for (const file of files) {
		if (
			liveModels >= MAX_PROJECT_SIBLING_MODELS
			|| totalChars + file.content.length > MAX_SIBLING_MODEL_CHARS_TOTAL
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
 * not belong to `keepProject`. Non-`file` schemes (`inmemory://` modals, the
 * config editor, …) are never touched. Returns how many models were disposed.
 */
export function sweepStaleApplicationModels(
	models: readonly ApplicationModelLike[],
	keepProject: string | undefined,
): number {
	const keepPrefix = keepProject ? `file:///${keepProject}/` : undefined;
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
