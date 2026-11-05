/**
 * Deploys a preset setup sent whose result it could not trust, per cluster and project, kept in this
 * browser's storage (read fresh each time, so every tab sees the same marks) for a Retry, a reload or
 * another tab to act on:
 *
 * - `unconfirmed`: set before the deploy is sent and kept when its outcome is unknown (an inconclusive
 *   stream, an unanswered write, a closed tab). It is never sent again while the component is missing
 *   (applications/DESIGN.md, "A live deploy is sent once"): setup waits for it to appear, or for the
 *   user to install it again.
 * - `partial`: the receiving node has it, but not every node is known to (a failed, unfollowable or
 *   unconfirmed rollout, or an unconfirmed install that has since appeared), so Retry deploys it again.
 *
 * Once the component is listed, its latest deploy record outranks either mark: one still in flight stops
 * setup rather than being deployed beside, and one every node took clears the mark.
 *
 * One storage key per cluster: setup holds a lock per cluster, so two clusters set up at once must not
 * share a record either side could overwrite.
 */
export type DeployMark = 'unconfirmed' | 'partial';

type Marks = Record<string, DeployMark>;

const storageKey = (entityId: string) => `Studio:PresetSetupDeploys:${entityId}`;

/**
 * Marks storage refused to write (full, or private mode), for this tab alone, with the value storage
 * held when it refused. They win over that older value, which a full storage still holds, and give way
 * once another tab changes the key: a copy kept past that would bring back a mark the other tab cleared.
 */
const fallback = new Map<string, { marks: Marks; over: string | null }>();

export function getDeployMarks(entityId: string): Marks {
	const held = fallback.get(entityId);
	let stored: string | null;
	try {
		stored = localStorage.getItem(storageKey(entityId));
	} catch {
		return held?.marks ?? {};
	}
	if (held) {
		if (stored === held.over) {
			return held.marks;
		}
		fallback.delete(entityId);
	}
	if (stored === null) {
		return {};
	}
	try {
		const parsed = JSON.parse(stored);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function write(entityId: string, marks: Marks) {
	const key = storageKey(entityId);
	try {
		if (Object.keys(marks).length === 0) {
			localStorage.removeItem(key);
		} else {
			localStorage.setItem(key, JSON.stringify(marks));
		}
		fallback.delete(entityId);
	} catch {
		fallback.set(entityId, { marks, over: storedOrNull(key) });
	}
}

// Storage that cannot be read at all never gets as far as comparing against this.
function storedOrNull(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function markDeploy(entityId: string, project: string, mark: DeployMark) {
	write(entityId, { ...getDeployMarks(entityId), [project]: mark });
}

export function clearDeployMark(entityId: string, project: string) {
	const marks = getDeployMarks(entityId);
	if (!Object.hasOwn(marks, project)) {
		return;
	}
	const { [project]: _cleared, ...rest } = marks;
	write(entityId, rest);
}

export function resetDeployMarksForTests() {
	fallback.clear();
	try {
		for (const key of Object.keys(localStorage)) {
			if (key.startsWith('Studio:PresetSetupDeploys:')) {
				localStorage.removeItem(key);
			}
		}
	} catch {
		// No storage in this environment.
	}
}
