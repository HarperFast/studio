import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { axiosRetry } from '@/lib/axiosRetry';
import { sleep } from '@/lib/sleep';
import { useMutation } from '@tanstack/react-query';

interface RestartInstanceParams {
	operation: 'restart_service' | 'restart';
	replicated: boolean;
}

export async function restartInstance(
	{ operation, replicated, instanceClient }: RestartInstanceParams & InstanceClientConfig,
): Promise<ReplicatedResponse> {
	// Both calls skip the restart gate: the caller may already have marked this instance as
	// restarting, and these are the requests driving and watching that restart.
	const { data } = await instanceClient.post('/', {
		operation,
		service: operation === 'restart_service' ? 'http' : undefined,
		replicated,
	}, { skipRestartGate: true });
	await waitUntilAnsweringAfterRestart({ instanceClient });
	return data;
}

/** Resolves once a just-restarted target answers again; rejects if it never does within ~3 minutes. */
export async function waitUntilAnsweringAfterRestart({ instanceClient }: InstanceClientConfig): Promise<void> {
	await sleep(10_000);
	await axiosRetry(
		() => getInstanceUserInfo({ instanceClient, timeout: 3_000, skipRestartGate: true }),
		12,
		15_000,
	);
}

export function useRestartInstance() {
	return useMutation({
		mutationFn: restartInstance,
	});
}
