import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { RestartUnconfirmedError } from '@/integrations/api/instance/status/restartUnconfirmed';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { axiosRetry } from '@/lib/axiosRetry';
import { sleep } from '@/lib/sleep';
import { useMutation } from '@tanstack/react-query';

const SETTLE_MS = 10_000;
const PROBE_TIMEOUT_MS = 3_000;
const PROBE_INTERVAL_MS = 15_000;
const PROBES = 24;
const SLOW_AFTER_PROBES = 12;
const RESTART_REQUEST_TIMEOUT_MS = 60_000;

const LONGEST_RESTART_MS = RESTART_REQUEST_TIMEOUT_MS + SETTLE_MS + PROBES * PROBE_TIMEOUT_MS
	+ (PROBES - 1) * PROBE_INTERVAL_MS;

/**
 * For marking a restart's target: longer than the longest restart, so the mark lapses only if its
 * owner never releases it, never while the watch below still expects the target back.
 */
export const RESTART_MARK_TTL_MS = LONGEST_RESTART_MS + 60_000;

interface RestartInstanceParams {
	operation: 'restart_service' | 'restart';
	replicated: boolean;
	/** Called once the target is still not back past the usual recovery time; the watch goes on. */
	onSlowToReturn?: () => void;
}

/**
 * Rejects with the restart request's own error when Harper refused it or never answered it, and with
 * {@link RestartUnconfirmedError} when Harper accepted it but the watch never saw the target back.
 */
export async function restartInstance(
	{ operation, replicated, instanceClient, onSlowToReturn }: RestartInstanceParams & InstanceClientConfig,
): Promise<ReplicatedResponse> {
	// Both calls skip the restart gate: the caller may already have marked this instance as
	// restarting, and these are the requests driving and watching that restart.
	const { data } = await instanceClient.post('/', {
		operation,
		service: operation === 'restart_service' ? 'http' : undefined,
		replicated,
	}, { skipRestartGate: true, timeout: RESTART_REQUEST_TIMEOUT_MS });
	try {
		await waitUntilAnsweringAfterRestart({ instanceClient, onSlowToReturn });
	} catch (cause) {
		throw new RestartUnconfirmedError(cause);
	}
	return data;
}

/**
 * Resolves once a just-restarted target answers `user_info`; rejects with the last probe's error if it never
 * does. Only a success counts: through central manager's proxy even a 401/403 is CM's answer, not the target's.
 */
export async function waitUntilAnsweringAfterRestart(
	{ instanceClient, onSlowToReturn }: InstanceClientConfig & Pick<RestartInstanceParams, 'onSlowToReturn'>,
): Promise<void> {
	// Not replayed on a gateway error: these probes are the retry, and a replay would outlast the mark.
	const probe = () =>
		getInstanceUserInfo({ instanceClient, timeout: PROBE_TIMEOUT_MS, skipRestartGate: true, skipGatewayRetry: true });
	await sleep(SETTLE_MS);
	try {
		await axiosRetry(probe, SLOW_AFTER_PROBES, PROBE_INTERVAL_MS);
	} catch {
		try {
			onSlowToReturn?.();
		} catch (error) {
			// A broken progress callback must not cut the watch short.
			console.error(error);
		}
		await sleep(PROBE_INTERVAL_MS);
		await axiosRetry(probe, PROBES - SLOW_AFTER_PROBES, PROBE_INTERVAL_MS);
	}
}

export function useRestartInstance() {
	return useMutation({
		mutationFn: restartInstance,
	});
}
