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
	| 'rolled_back'
	/** Built and installed on every node, not live (5.3.0+). Activating it writes a record of its own. */
	| 'staged';

// Harper's own set (harper `components/deploymentOperations.ts:19`): a staged record never changes again.
export const TERMINAL_DEPLOYMENT_STATUSES: ReadonlySet<DeploymentStatus> = new Set([
	'success',
	'failed',
	'rolled_back',
	'staged',
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

/**
 * What an install came from (5.3.1+): `npm:<name>@<version>`, `git:<commit>`, `integrity:<sri>` or `unidentified`,
 * absent for a payload; and the sha256 of each root lockfile, or why it could not be read.
 */
export interface InstallFingerprint {
	source?: string;
	lockfiles?: Record<string, string | { unreadable?: string }>;
}

export interface DeploymentPeerResult {
	node: string;
	status?: string;
	/** Harper >= 5.1 records `{ message, code }`; raw replicator results can be a bare string. */
	error?: string | DeploymentPeerError | null;
	started_at?: number;
	completed_at?: number;
	/** Present once the origin compared this peer's install with its own (5.3.1+). */
	install?: InstallFingerprint | null;
	/** `false` when anything differs, `null` when the evidence is missing or unidentified, `true` when it all matches. */
	install_matches?: boolean | null;
	/** `source` and/or the lockfile names that differ. */
	install_differs?: string[];
}

export interface DeploymentPeerError {
	message?: string;
	code?: string | number;
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
	/** On an activation (5.3.0+), the deployment whose staged or kept release it made live. */
	activated_from?: string | null;
	/** The origin's own install, on a deploy or a stage (5.3.1+); an activation installs nothing. */
	install_fingerprint?: InstallFingerprint | null;
	error?: DeploymentError | null;
}

export interface ListDeploymentsResponse {
	deployments: Deployment[];
	total: number;
}
