import { pluralize } from '@/lib/pluralize';
import type { AxiosResponse } from 'axios';

export interface ReplicatedResponse {
	message: string;
	replicated?: Array<ReplicatedResponseSuccess | ReplicatedResponseFailure>;
}

interface ReplicatedResponseNarrowed extends ReplicatedResponse {
	replicated: Array<ReplicatedResponseSuccess | ReplicatedResponseFailure>;
}

export interface ReplicatedResponseSuccess {
	node: string;
	message: boolean;
	requestId: number;
}

export interface ReplicatedResponseFailure {
	node: string;
	reason: string;
	status: 'failed';
}

export function replicationFailed(response: ReplicatedResponse): response is ReplicatedResponseNarrowed {
	return response.replicated?.some(r => isReplicatedResponseFailure(r)) ?? false;
}

export function isReplicatedResponseSuccess(
	message: ReplicatedResponseSuccess | ReplicatedResponseFailure,
): message is ReplicatedResponseSuccess {
	return (message as ReplicatedResponseFailure).status !== 'failed';
}

export function isReplicatedResponseFailure(
	message: ReplicatedResponseSuccess | ReplicatedResponseFailure,
): message is ReplicatedResponseFailure {
	return (message as ReplicatedResponseFailure).status === 'failed';
}

export function rejectReplicationFailures(response: Pick<AxiosResponse<ReplicatedResponse>, 'data'>) {
	if (replicationFailed(response.data)) {
		// `replicated` lists the called node's peers, not the called node itself.
		const peerCount = response.data.replicated.length;
		const failures = response.data.replicated.filter(isReplicatedResponseFailure);
		const failedPeers = failures.length === peerCount
			? peerCount === 1 ? 'the peer node' : `all ${peerCount} peer nodes`
			: `${failures.length} of ${pluralize(peerCount, 'peer node', 'peer nodes')}`;
		const explanation = `Failed to replicate to ${failedPeers}:`;
		const details = failures.map(f => `${f.node}: ${f.reason}`).join('\n');
		return Promise.reject(explanation + '\n' + details);
	}
	return response as AxiosResponse<ReplicatedResponse>;
}
