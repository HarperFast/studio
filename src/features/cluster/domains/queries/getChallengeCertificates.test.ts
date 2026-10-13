import { QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	CERTIFICATE_IDLE_POLL_MS,
	CERTIFICATE_PROGRESS_POLL_MS,
	CERTIFICATE_WATCH_AFTER_DOMAIN_CHANGE_MS,
	ChallengeCertificate,
	challengeCertificatesQueryKey,
	getChallengeCertificatesQueryOptions,
	watchChallengeCertificates,
} from './getChallengeCertificates';

vi.mock('@/config/getInstanceClient', () => ({ getInstanceClient: vi.fn() }));

function certificate(overrides: Partial<ChallengeCertificate>): ChallengeCertificate {
	return {
		domain: 'example.com',
		issueDate: '2026-09-01T00:00:00Z',
		renewalDate: '2026-11-01T00:00:00Z',
		challengeToken: 'token',
		challengeContent: 'content',
		inProgress: false,
		...overrides,
	};
}

function nextPoll(clusterId: string, data: ChallengeCertificate[] | undefined, error: unknown = null) {
	const { refetchInterval } = getChallengeCertificatesQueryOptions(clusterId);
	return (refetchInterval as (query: unknown) => number | false | undefined)({ state: { data, error } });
}

afterEach(() => {
	vi.useRealTimers();
});

describe('ChallengeCertificate poll', () => {
	it('idles when there is nothing to watch, including the empty result a missing table reads as', () => {
		expect(nextPoll('clu-idle', [])).toBe(CERTIFICATE_IDLE_POLL_MS);
		expect(nextPoll('clu-idle', undefined)).toBe(CERTIFICATE_IDLE_POLL_MS);
		expect(nextPoll('clu-idle', [certificate({})])).toBe(CERTIFICATE_IDLE_POLL_MS);
	});

	it('polls at the progress rate while a certificate is pending or being renewed', () => {
		expect(nextPoll('clu-pending', [certificate({}), certificate({ issueDate: null })])).toBe(
			CERTIFICATE_PROGRESS_POLL_MS,
		);
		expect(nextPoll('clu-pending', [certificate({ inProgress: true })])).toBe(CERTIFICATE_PROGRESS_POLL_MS);
	});

	it('polls at the progress rate for a while after a domain change, then idles again', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
		const queryClient = new QueryClient();
		const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

		await watchChallengeCertificates(queryClient, 'clu-watched');

		expect(invalidate).toHaveBeenCalledWith({ queryKey: challengeCertificatesQueryKey('clu-watched') });
		expect(nextPoll('clu-watched', [])).toBe(CERTIFICATE_PROGRESS_POLL_MS);
		expect(nextPoll('clu-unrelated', [])).toBe(CERTIFICATE_IDLE_POLL_MS);

		vi.setSystemTime(Date.now() + CERTIFICATE_WATCH_AFTER_DOMAIN_CHANGE_MS + 1);
		expect(nextPoll('clu-watched', [])).toBe(CERTIFICATE_IDLE_POLL_MS);
	});

	it('still stops on a 403, whatever the cadence would have been', () => {
		const forbidden = new AxiosError('Request failed with status code 403');
		forbidden.response = { status: 403 } as AxiosError['response'];
		expect(nextPoll('clu-forbidden', [certificate({ issueDate: null })], forbidden)).toBe(false);
	});
});
