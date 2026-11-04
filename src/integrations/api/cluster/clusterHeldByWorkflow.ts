import { errorText } from '@/lib/errorText';
import { AxiosError } from 'axios';

export const CLUSTER_BUSY_TITLE = 'Update in progress';
export const CLUSTER_BUSY_MESSAGE = 'This cluster is busy with an update. Try again once it finishes.';

// Central manager's two refusals (`assertClusterMutable`, `admitClusterContainerOp`) both open this way and carry no
// machine-readable code, so the sentence is the contract.
const HELD_BY_WORKFLOW = /^Cluster is held by workflow (\S+?)[;.]/;
const CLUSTER_PATH = /^\/Cluster\/([^/?#]+)/;

export interface ClusterHeldByWorkflow {
	workflowId: string;
	/** From the refused request's URL; null when it wasn't a `/Cluster/<id>` call. */
	clusterId: string | null;
}

function responseText(data: unknown): string | undefined {
	if (typeof data === 'string') { return data; }
	if (!data || typeof data !== 'object') { return undefined; }
	const body = data as { title?: unknown; error?: unknown; message?: unknown };
	return errorText(body.title) ?? errorText(body.error) ?? errorText(body.message);
}

/** A 409 central manager sent because a durable workflow holds the cluster, or null for anything else. */
export function clusterHeldByWorkflow(error: unknown): ClusterHeldByWorkflow | null {
	if (!(error instanceof AxiosError) || error.response?.status !== 409) { return null; }
	const match = responseText(error.response.data)?.match(HELD_BY_WORKFLOW);
	if (!match) { return null; }
	return { workflowId: match[1], clusterId: clusterIdOf(error.config?.url) };
}

/** Never throws: this runs on every failed mutation, and a bad URL must not replace the error being handled. */
function clusterIdOf(url: unknown): string | null {
	if (typeof url !== 'string') { return null; }
	try {
		const encoded = new URL(url, 'http://relative.invalid').pathname.match(CLUSTER_PATH)?.[1];
		return encoded ? decodeURIComponent(encoded) : null;
	} catch {
		return null;
	}
}
