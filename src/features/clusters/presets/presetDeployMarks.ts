/**
 * Deploys a preset setup sent whose result it could not trust, per cluster and project, kept in this
 * browser's storage (read fresh each time, so every tab sees the same marks) for a Retry, a reload or
 * another tab to act on:
 *
 * - `unconfirmed`: set before the deploy is sent and kept when its outcome is unknown (an inconclusive
 *   stream, an unanswered write, a closed tab). It is never sent again while the component is missing
 *   (applications/DESIGN.md, "A live deploy is sent once"): setup waits for it to appear, or for the
 *   user to install it again.
 * - `partial`: the receiving node has it, but not every node is known to (a failed or unfollowable
 *   rollout, or an unconfirmed install that has since appeared), so Retry deploys it again.
 */
export type DeployMark = 'unconfirmed' | 'partial';

const STORAGE_KEY = 'Studio:PresetSetupDeploys';

type Marks = Record<string, Record<string, DeployMark>>;

// Only for a browser whose storage refuses: the marks then hold for this tab alone.
let fallback: Marks = {};

function read(): Marks {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === null) {
			return fallback;
		}
		const parsed = JSON.parse(stored);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return fallback;
	}
}

function write(next: Marks) {
	fallback = next;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Private mode: `fallback` keeps it for this tab.
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
	fallback = {};
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// No storage in this environment.
	}
}
