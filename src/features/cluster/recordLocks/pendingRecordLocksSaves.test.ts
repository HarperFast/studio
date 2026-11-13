import {
	clusterReadRequestedSince,
	forgetClusterReadsForTests,
	recordClusterRead,
} from '@/features/cluster/queries/getClusterInfoQuery';
import { nextObservationStamp } from '@/lib/restart/restartTracker';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetAllSavesForTests, pendingSave, rememberSave } from './pendingRecordLocksSaves';

afterEach(() => {
	vi.useRealTimers();
	forgetAllSavesForTests();
	forgetClusterReadsForTests();
});

describe('rememberSave', () => {
	it('never ties with a read requested before it, even in the same millisecond', () => {
		vi.useFakeTimers({ now: 1_000_000 });
		recordClusterRead('clu-1', nextObservationStamp());

		rememberSave('clu-1', true);

		expect(clusterReadRequestedSince('clu-1', pendingSave('clu-1')!.at)).toBe(false);
		recordClusterRead('clu-1', nextObservationStamp());
		expect(clusterReadRequestedSince('clu-1', pendingSave('clu-1')!.at)).toBe(true);
	});
});
