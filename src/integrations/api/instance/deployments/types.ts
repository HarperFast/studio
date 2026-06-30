/** Lifecycle status of an `hdb_deployment` row (Harper >= 5.1.0). */
export type DeploymentStatus =
	| 'pending'
	| 'extracting'
	| 'installing'
	| 'loading'
	| 'replicating'
	| 'restarting'
	| 'success'
	| 'failed'
	| 'rolled_back';

export const TERMINAL_DEPLOYMENT_STATUSES: ReadonlySet<DeploymentStatus> = new Set([
	'success',
	'failed',
	'rolled_back',
]);

export function isTerminalDeploymentStatus(status: DeploymentStatus | undefined): boolean {
	return !!status && TERMINAL_DEPLOYMENT_STATUSES.has(status);
}

export interface DeploymentEventLogEntry {
	/** Epoch ms. */
	t: number;
	event: string;
	data: unknown;
}

export interface DeploymentPeerResult {
	node: string;
	status?: string;
	error?: string;
	started_at?: number;
	completed_at?: number;
}

export interface DeploymentError {
	message: string;
	code?: string | number;
	phase?: string;
}

/**
 * A row from Harper's replicated `hdb_deployment` table. `payload_blob` never travels over
 * the operations API — `list_deployments` and `get_deployment` strip it and expose
 * `payload_blob_present` instead.
 */
export interface Deployment {
	deployment_id: string;
	project: string;
	package_identifier?: string | null;
	payload_hash?: string | null;
	payload_size?: number | null;
	payload_blob_present?: boolean;
	status: DeploymentStatus;
	phase?: string;
	event_log?: DeploymentEventLogEntry[];
	peer_results?: DeploymentPeerResult[];
	origin_node?: string;
	restart_mode?: string | null;
	started_at?: number;
	completed_at?: number;
	user?: string;
	restorable?: boolean;
	rollback_of?: string | null;
	error?: DeploymentError | null;
}

export interface ListDeploymentsResponse {
	deployments: Deployment[];
	total: number;
}
