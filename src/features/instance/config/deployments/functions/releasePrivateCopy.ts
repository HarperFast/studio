import {
	BranchedDatabases,
	describeBranchedDatabases,
	toBranchedDatabases,
} from '@/integrations/api/instance/applications/branchedDatabases';
import { Deployment } from '@/integrations/api/instance/deployments/types';

/** A `set` with no setting puts the application on the shared databases. */
type ReleasePrivateCopy =
	| { kind: 'unknown' }
	| { kind: 'unchanged' }
	| { kind: 'set'; setting: BranchedDatabases | undefined };

export function releasePrivateCopy(deployment: Pick<Deployment, 'routing'>): ReleasePrivateCopy {
	const { routing } = deployment;
	if (routing === null) {
		return { kind: 'unchanged' };
	}
	if (typeof routing !== 'object') {
		return { kind: 'unknown' };
	}
	return { kind: 'set', setting: toBranchedDatabases(routing.branchedDatabases) };
}

export function describeReleasePrivateCopy(copy: ReleasePrivateCopy): string | undefined {
	switch (copy.kind) {
		case 'unknown':
			return undefined;
		case 'unchanged':
			return 'Keeps current';
		case 'set':
			return copy.setting === undefined
				? 'Off'
				: copy.setting === true
				? 'All databases except system'
				: describeBranchedDatabases(copy.setting);
	}
}
