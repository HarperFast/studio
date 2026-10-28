/**
 * Deploys a preset setup sent whose result it could not trust, per cluster and project, kept in this
 * browser so a Retry or a reload acts on them:
 *
 * - `unconfirmed`: the request may or may not have started a deploy (an inconclusive stream, an
 *   unanswered write). It is never sent again by itself (applications/DESIGN.md, "A live deploy is
 *   sent once"); setup waits for the component to appear, or for the user to install it again.
 * - `partial`: the deploy ran, but not every node is known to have taken it (a failed or unfollowable
 *   rollout). The receiving node already lists the component, so without this mark a Retry would skip it.
 */
export type DeployMark = 'unconfirmed' | 'partial';

const STORAGE_KEY = 'Studio:PresetSetupDeploys';

type Marks = Record<string, Record<string, DeployMark>>;

let cache: Marks | undefined;

function read(): Marks {
	if (cache) {
		return cache;
	}
	try {
		const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
		cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		cache = {};
	}
	return cache!;
}

function write(next: Marks) {
	cache = next;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Private mode: the mark still holds for this tab.
	}
}

export function getDeployMarks(entityId: string): Record<string, DeployMark> {
	return read()[entityId] ?? {};
}

export function markDeploy(entityId: string, project: string, mark: DeployMark) {
	const marks = read();
	write({ ...marks, [entityId]: { ...marks[entityId], [project]: mark } });
}

export function clearDeployMark(entityId: string, project: string) {
	const marks = read();
	const { [project]: _cleared, ...rest } = marks[entityId] ?? {};
	const { [entityId]: _entity, ...others } = marks;
	write(Object.keys(rest).length ? { ...others, [entityId]: rest } : others);
}

/** Tests only. */
export function resetDeployMarksForTests() {
	cache = undefined;
}
