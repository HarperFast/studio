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
 * One storage key per cluster: setup holds a lock per cluster, so two clusters set up at once must not
 * share a record either side could overwrite.
 */
export type DeployMark = 'unconfirmed' | 'partial';

type Marks = Record<string, DeployMark>;

const storageKey = (entityId: string) => `Studio:PresetSetupDeploys:${entityId}`;

// Only for a browser whose storage refuses: the marks then hold for this tab alone.
const fallback = new Map<string, Marks>();

export function getDeployMarks(entityId: string): Marks {
	try {
		const stored = localStorage.getItem(storageKey(entityId));
		if (stored === null) {
			return fallback.get(entityId) ?? {};
		}
		const parsed = JSON.parse(stored);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return fallback.get(entityId) ?? {};
	}
}

function write(entityId: string, marks: Marks) {
	const empty = Object.keys(marks).length === 0;
	if (empty) {
		fallback.delete(entityId);
	} else {
		fallback.set(entityId, marks);
	}
	try {
		if (empty) {
			localStorage.removeItem(storageKey(entityId));
		} else {
			localStorage.setItem(storageKey(entityId), JSON.stringify(marks));
		}
	} catch {
		// Private mode: `fallback` keeps it for this tab.
	}
}

export function markDeploy(entityId: string, project: string, mark: DeployMark) {
	write(entityId, { ...getDeployMarks(entityId), [project]: mark });
}

export function clearDeployMark(entityId: string, project: string) {
	const { [project]: _cleared, ...rest } = getDeployMarks(entityId);
	write(entityId, rest);
}

/** Tests only. */
export function resetDeployMarksForTests() {
	for (const entityId of fallback.keys()) {
		write(entityId, {});
	}
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
