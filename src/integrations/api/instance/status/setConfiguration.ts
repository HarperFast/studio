import { deletedClusterStatuses } from '@/config/clusterStatuses';
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { Instance } from '@/integrations/api/api.patch';
import { ReplicatedResponse, type ReplicatedResponseFailure } from '@/integrations/api/replication';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

/**
 * The first Harper release whose `set_configuration` takes `replicated: true` and fans the write out
 * to every replication peer (HarperFast/harper#1556). 5.0 and 5.1 apply the change locally and report
 * no peers. Prereleases of 5.2.0 read as unsupported.
 */
const REPLICATED_SET_CONFIGURATION_MIN_VERSION = '5.2.0';

/**
 * Whether a cluster-wide config save should fan its write out: some other live member exists to
 * reach — including ones Studio will not restart — and every live member runs a Harper that can.
 */
export function shouldFanOutSetConfiguration(
	instances: ReadonlyArray<Pick<Instance, 'status' | 'version'>>,
): boolean {
	const live = instances.filter(instance => !(instance.status && deletedClusterStatuses.includes(instance.status)));
	return live.length > 1
		&& live.every(instance =>
			!!instance.version && wasAReleasedBeforeB(REPLICATED_SET_CONFIGURATION_MIN_VERSION, instance.version)
		);
}

interface SetConfigurationParams extends InstanceClientConfig {
	[key: string]: unknown;
}

interface SetConfigurationOptions {
	/** Resolve with every peer's result when a `replicated: true` write failed on some, instead of rejecting. */
	keepReplicationFailures?: boolean;
}

export async function setConfiguration(
	{ instanceClient, ...changes }: SetConfigurationParams,
	{ keepReplicationFailures }: SetConfigurationOptions = {},
): Promise<ReplicatedResponse> {
	const body = { operation: 'set_configuration', ...changes };
	const { data } = keepReplicationFailures
		? await instanceClient.post('/', body, { keepReplicationFailures })
		: await instanceClient.post('/', body);
	return data;
}

/**
 * Whether a status is Harper refusing the change itself: 400, a setting it rejects, or 409, one an environment
 * variable defines. A 401 or 403 is about who sent the write, and a 5xx about the node failing to make it.
 */
export function isConfigurationRefusalStatus(status: unknown): boolean {
	return status === 400 || status === 409;
}

/**
 * Whether a peer's own answer turned the change down: any 4xx. harper-pro sets a failed peer's `statusCode` only from
 * that peer's answer, never for a connection failure, and a peer runs an operation forwarded by an authenticated node
 * without checking its permissions (`replication/replicationConnection.ts`, `OPERATION_REQUEST`), so a 4xx there is
 * about the request. Studio's own write is held to 400 and 409, because its 403 is the signed-in user's permission.
 */
function isPeerRefusalStatus(statusCode: number): boolean {
	return statusCode >= 400 && statusCode < 500;
}

// What may come before a peer's own error message: the `Error: ` harper-pro's origin wraps it in, then its class.
const PEER_ERROR_PREFIX = /^(?:Error: )?(?:(?:[A-Za-z_$][\w$]*)?Error: )?/;

/**
 * A peer's refusal as harper-pro reports it without a `statusCode`. A failed peer's `reason` is
 * `error.toString()` (`replication/replicator.ts`, `replicateOperation`). When the peer answered with an error,
 * that error is `new Error(errorToString(peerError))` (`replication/replicationConnection.ts`,
 * `OPERATION_RESPONSE`), and harper's `errorToString` renders `<constructor name>: <message>` and drops the status
 * (`utility/logging/harper_logger.ts`), so the reason reads `Error: HdbError: <message>`. The leading `Error: ` is
 * optional here, for an origin that passes the peer's text on as it came. A peer that could not be reached reads
 * `Error: <the connection's own message>`, including `ws`'s `Unexpected server response: 403` for a refused
 * handshake. A class alone is not a refusal: `HdbError` is also a 500 (`Error parsing harperdb-config.yaml`) and
 * `ClientError` a 501 or 503 elsewhere in Harper, so only `set_configuration`'s own 400 and 409 messages are listed
 * (harper `config/configUtils.ts`).
 */
const UNCODED_PEER_REFUSALS = [
	// 400 from `validateConfig` and the heap-memory check (`HDB_ERROR_MSGS.CONFIG_VALIDATION`, `commonErrors.ts`).
	/^(?:Error: )?HdbError: (Harper config file validation error: [\s\S]+)/,
	// 400: an unrecognized parameter, or a component named after one of Harper's own sections.
	/^(?:Error: )?HdbError: (Unable to update config, [\s\S]+)/,
	// 400: a Studio navigation or landing setting Harper rejects.
	/^(?:Error: )?ClientError: (Unable to update config: [\s\S]+)/,
	// 409: an environment variable defines the setting (`Cannot set … defines it`, `Cannot set models: … defines models`).
	/^(?:Error: )?ClientError: (Cannot set [\s\S]+)/,
];

/**
 * Harper's own reason when a peer refused a fanned-out `set_configuration`, or undefined when the entry does not
 * show one: a peer that was unreachable, timed out, or failed some other way, or a reason Studio does not know.
 * A `statusCode` decides it when the peer reported one. Without one the outcome is unknown, so only the reason's
 * text is read.
 */
export function describePeerRefusal(entry: unknown): string | undefined {
	const { status, reason, statusCode } = (entry ?? {}) as Partial<ReplicatedResponseFailure>;
	if (status !== 'failed' || typeof reason !== 'string') {
		return undefined;
	}
	if (typeof statusCode === 'number') {
		return isPeerRefusalStatus(statusCode)
			? reason.replace(PEER_ERROR_PREFIX, '').trim() || `status ${statusCode}`
			: undefined;
	}
	for (const pattern of UNCODED_PEER_REFUSALS) {
		const message = pattern.exec(reason)?.[1];
		if (message) {
			return message;
		}
	}
	return undefined;
}

/**
 * Each peer that refused a fanned-out `set_configuration`, keyed by its lower-cased node name, as `<node>: <reason>`.
 * A peer that failed any other way is left out: it may only have been unreachable.
 */
export function refusingReplicationPeers(response: unknown): Map<string, string> {
	const refusals = new Map<string, string>();
	const replicated: unknown = (response as ReplicatedResponse | null | undefined)?.replicated;
	if (!Array.isArray(replicated)) {
		return refusals;
	}
	for (const entry of replicated) {
		const node: unknown = (entry as Partial<ReplicatedResponseFailure> | null)?.node;
		const refusal = describePeerRefusal(entry);
		if (refusal && typeof node === 'string' && node) {
			refusals.set(node.toLowerCase(), `${node}: ${refusal}`);
		}
	}
	return refusals;
}
