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
	message: boolean | string;
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

/**
 * The lower-cased names of the peers a replicated operation reports as applied: entries carrying the
 * peer's own answer (a `message` string) and the `node` Harper attached to it. Anything else is left
 * out, so an unrecognized response reads as reaching no one.
 */
export function acknowledgedReplicationNodes(response: unknown): Set<string> {
	const acknowledged = new Set<string>();
	const replicated: unknown = (response as ReplicatedResponse | null | undefined)?.replicated;
	if (!Array.isArray(replicated)) {
		return acknowledged;
	}
	for (const entry of replicated) {
		if (
			entry && typeof entry === 'object' && isReplicatedResponseSuccess(entry)
			&& typeof entry.message === 'string' && entry.message && typeof entry.node === 'string' && entry.node
		) {
			acknowledged.add(entry.node.toLowerCase());
		}
	}
	return acknowledged;
}

export function rejectReplicationFailures(response: Pick<AxiosResponse<ReplicatedResponse>, 'data'>) {
	if (replicationFailed(response.data)) {
		const successes = response.data.replicated.filter(isReplicatedResponseSuccess);
		const failures = response.data.replicated.filter(isReplicatedResponseFailure);
		const explanation = successes.length
			? `The operation partially succeeded, but ${pluralize(failures.length, 'node', 'nodes')} failed:`
			: failures.length === 1
			? `The operation failed on the single node:`
			: `The operation failed on all ${failures.length} nodes:`;
		const details = failures.map(f => `${f.node}: ${f.reason}`).join('\n');
		return Promise.reject(explanation + '\n' + details);
	}
	return response as AxiosResponse<ReplicatedResponse>;
}
