import { SSEOperationError } from '@/integrations/api/sse/errors';
import { DeployRolloutError } from './restartJob';

/**
 * How a successful, unstaged restarting deploy was checked, from Harper 5.4.0. Open-ended: Harper can
 * also decide `withdrawn`, and a newer version may add more.
 */
export type DeployCertification = 'certified' | 'uncertified' | 'unavailable' | 'not-requested' | (string & {});

/** What a canary decided about a release it refused. A rejected deploy carries it in place of the string. */
export interface CertificationDecision {
	/** `rejected`, or `interrupted` for a restart that stopped before the canary decided. */
	status: string;
	reason?: string;
	/** The release put back in its place; `null` when there was none to put back. */
	restored: string | null;
	/** No earlier release to restore, so no worker on that node loads the component until it is deployed again. */
	failedClosed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readCertificationDecision(value: unknown): CertificationDecision | undefined {
	if (!isRecord(value) || typeof value.status !== 'string' || !value.status) {
		return undefined;
	}
	return {
		status: value.status,
		reason: typeof value.reason === 'string' && value.reason ? value.reason : undefined,
		restored: typeof value.restored === 'string' && value.restored ? value.restored : null,
		failedClosed: value.failed_closed === true,
	};
}

export interface DeployFailureDetails {
	deploymentId?: string;
	certification?: CertificationDecision;
}

/**
 * The record id and canary decision a failed deploy carries, from whichever transport ran it: the
 * streamed `error` event, the buffered 4xx/5xx body, or a restart job that failed after the deploy.
 */
export function deployFailureDetails(error: unknown): DeployFailureDetails {
	if (error instanceof SSEOperationError) {
		return { deploymentId: error.deploymentId, certification: readCertificationDecision(error.certification) };
	}
	if (error instanceof DeployRolloutError) {
		return { deploymentId: error.deploymentId };
	}
	const data: unknown = (error as { response?: { data?: unknown } } | undefined)?.response?.data;
	if (!isRecord(data)) {
		return {};
	}
	return {
		deploymentId: typeof data.deployment_id === 'string' && data.deployment_id ? data.deployment_id : undefined,
		certification: readCertificationDecision(data.certification),
	};
}
