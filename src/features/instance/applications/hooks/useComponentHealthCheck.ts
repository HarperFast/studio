import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import {
	APIDirectoryEntry,
	ComponentStatusLevel,
	getComponents,
} from '@/integrations/api/instance/applications/getComponents';
import { sleep } from '@/lib/sleep';
import { useCallback } from 'react';

export interface ComponentHealthResult {
	/** Final observed status, or 'indeterminate' if it never settled within the window. */
	level: ComponentStatusLevel | 'indeterminate';
	message?: string;
}

// The new deploy_component returns before worker threads finish loading the component, so a
// freshly-deployed component is briefly `loading`/`unknown`. Poll a few times to let it
// settle before reporting health (issue #1233).
const INITIAL_DELAY_MS = 1_500;
const POLL_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = 8;

const SETTLED: ReadonlySet<ComponentStatusLevel> = new Set(['healthy', 'warning', 'error']);

function findComponent(tree: APIDirectoryEntry, project: string): APIDirectoryEntry | undefined {
	return tree.entries.find(
		(entry): entry is APIDirectoryEntry => entry.name === project && 'entries' in entry,
	);
}

/**
 * Verify a freshly-deployed component became healthy. Returns a function that polls
 * `get_components` until the component's status settles (healthy/warning/error) or a short
 * window elapses, so callers can surface a definitive health result after a deploy.
 */
export function useComponentHealthCheck(params: InstanceClientIdConfig) {
	return useCallback(
		async (project: string): Promise<ComponentHealthResult> => {
			await sleep(INITIAL_DELAY_MS);
			let last: ComponentHealthResult = { level: 'indeterminate' };
			for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
				try {
					const tree = await getComponents(params);
					const status = findComponent(tree, project)?.status;
					if (status) {
						last = { level: status.status, message: status.message };
						if (SETTLED.has(status.status)) {
							return last;
						}
					}
				} catch {
					// Transient read failure (e.g. instance mid-restart) — keep polling.
				}
				if (attempt < MAX_ATTEMPTS - 1) {
					await sleep(POLL_INTERVAL_MS);
				}
			}
			return last;
		},
		[params],
	);
}
