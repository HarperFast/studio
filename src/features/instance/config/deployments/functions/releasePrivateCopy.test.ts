import { DeploymentRouting } from '@/integrations/api/instance/deployments/types';
import { describe, expect, it } from 'vitest';
import { describeReleasePrivateCopy, releasePrivateCopy } from './releasePrivateCopy';

const routing = (branchedDatabases: DeploymentRouting['branchedDatabases']): DeploymentRouting => ({
	host: null,
	urlPath: null,
	isolated: null,
	branchedDatabases,
});

describe('releasePrivateCopy', () => {
	it('is unknown on a record without routing, which Harper before 5.4 never writes', () => {
		expect(releasePrivateCopy({})).toEqual({ kind: 'unknown' });
		expect(describeReleasePrivateCopy(releasePrivateCopy({}))).toBeUndefined();
	});

	it('keeps the current setting for a release that puts back no routing', () => {
		expect(releasePrivateCopy({ routing: null })).toEqual({ kind: 'unchanged' });
		expect(describeReleasePrivateCopy({ kind: 'unchanged' })).toBe('Keeps current');
	});

	it('puts the application on the shared databases when the release leaves the setting unset', () => {
		expect(releasePrivateCopy({ routing: routing(null) })).toEqual({ kind: 'set', setting: undefined });
		expect(describeReleasePrivateCopy(releasePrivateCopy({ routing: routing(null) }))).toBe('Off');
	});

	it('reads an empty list as no copy, since it branches nothing', () => {
		expect(releasePrivateCopy({ routing: routing([]) })).toEqual({ kind: 'set', setting: undefined });
	});

	it('names the databases a release copies, or all of them', () => {
		expect(releasePrivateCopy({ routing: routing(['data', 'events']) })).toEqual({
			kind: 'set',
			setting: ['data', 'events'],
		});
		expect(describeReleasePrivateCopy(releasePrivateCopy({ routing: routing(['data', 'events']) }))).toBe(
			'data, events',
		);
		expect(describeReleasePrivateCopy(releasePrivateCopy({ routing: routing(true) }))).toBe(
			'All databases except system',
		);
	});
});
