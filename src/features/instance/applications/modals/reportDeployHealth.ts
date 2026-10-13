import {
	describeCertification,
	describeUnfollowable,
} from '@/features/instance/applications/components/DeployProgress/describeDeployOutcome';
import { ComponentHealthResult } from '@/features/instance/applications/hooks/useComponentHealthCheck';
import { DeployComponentResult } from '@/integrations/api/instance/applications/deployComponentStream';
import { DeployRolloutError } from '@/integrations/api/instance/applications/restartJob';
import { isUnansweredWrite, UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';
import { toast } from 'sonner';

interface DeployNotes {
	lines: string[];
	warn: boolean;
}

/** A toast's link to the deployment's record, and the toast to replace, when a caller has them. */
interface DeployToastOptions {
	id?: string | number;
	action?: { label: string; onClick: () => void };
}

export function deployNotes(result: DeployComponentResult | undefined): DeployNotes {
	const lines: string[] = [];
	let warn = false;
	if (typeof result?.certification === 'string') {
		const { label, detail, certified } = describeCertification(result.certification);
		if (!certified) {
			lines.push(detail ? `${label}: ${detail}` : `${label}.`);
		}
	}
	for (const warning of result?.warnings ?? []) {
		lines.push(warning);
		warn = true;
	}
	const unconfirmed = result?.rollout?.nodes.filter((node) => node.outcome === 'unconfirmed') ?? [];
	if (unconfirmed.length) {
		lines.push(`The restart was not confirmed on ${unconfirmed.map((node) => node.node).join(', ')}.`);
		warn = true;
	}
	return { lines, warn };
}

function withNotes(message: string | undefined, notes: DeployNotes): string | undefined {
	return [message, ...notes.lines].filter(Boolean).join(' ') || undefined;
}

/**
 * Surface the post-deploy health-check result as a toast.
 *
 * The new `deploy_component` returns before the component finishes loading on worker
 * threads, so a successful deploy call doesn't guarantee a working component (#1233). This
 * translates the polled status into clear user feedback.
 */
export function reportDeployHealth(
	project: string,
	health: ComponentHealthResult,
	notes: DeployNotes = { lines: [], warn: false },
	options: DeployToastOptions = {},
): void {
	switch (health.level) {
		case 'healthy':
			if (notes.warn) {
				toast.warning(`${project} deployed with warnings`, {
					...options,
					description: withNotes(health.message, notes),
				});
				return;
			}
			toast.success(`${project} deployed and healthy`, { ...options, description: withNotes(health.message, notes) });
			return;
		case 'warning':
			toast.warning(`${project} deployed with warnings`, {
				...options,
				description: withNotes(health.message ?? 'The component loaded but reported a warning.', notes),
			});
			return;
		case 'error':
			toast.error(`${project} deployed but failed to load`, {
				...options,
				description: withNotes(health.message ?? 'The component reported an error after deploying.', notes),
			});
			return;
		case 'loading':
		case 'unknown':
		case 'indeterminate':
		default:
			toast.success(`${project} deployed`, {
				...options,
				description: withNotes('Still verifying — the component is loading. Check its status shortly.', notes),
			});
			return;
	}
}

/**
 * Report a deploy that resolved, or whose stream ended without saying (`result` undefined).
 *
 * A rollout Studio could not follow skips the health check: that reads the one node Studio reaches,
 * which can be healthy on the release a rejecting node kept — exactly what following the job is for.
 * Resolves `false` when the outcome is unknown.
 */
export async function reportDeployOutcome(
	project: string,
	result: DeployComponentResult | undefined,
	runHealthCheck: (project: string) => Promise<ComponentHealthResult>,
	options: DeployToastOptions = {},
): Promise<boolean> {
	if (reportUnfollowable(project, result, options)) {
		return false;
	}
	reportDeployHealth(project, await runHealthCheck(project), deployNotes(result), options);
	return true;
}

/**
 * Report a resolved deploy whose component is not health-checked, by what its rollout said. `success` is the toast
 * for a deploy with nothing to add; it is replaced by a warning when a rollout is unknown or has something to read.
 */
export function reportDeployResult(
	project: string,
	result: DeployComponentResult | undefined,
	success: { title: string; description?: string; warningTitle?: string },
	options: DeployToastOptions = {},
): void {
	if (reportUnfollowable(project, result, options)) {
		return;
	}
	const notes = deployNotes(result);
	if (notes.warn) {
		toast.warning(success.warningTitle ?? `${project} deployed with warnings`, {
			...options,
			description: withNotes(success.description, notes),
		});
		return;
	}
	toast.success(success.title, { ...options, description: withNotes(success.description, notes) });
}

export type DeployVerb = 'import' | 'stage' | 'redeploy' | 'activate';

const DONE: Record<DeployVerb, string> = {
	import: 'imported',
	stage: 'staged',
	redeploy: 'redeployed',
	activate: 'activated',
};

/** Never "Failed" for a deploy that got no verdict: it may be live, and its message says to check first. */
export function deployFailureTitle(error: unknown, project: string, verb: DeployVerb): string {
	return isUnansweredWrite(error) ? `Couldn't confirm ${project} was ${DONE[verb]}` : `Failed to ${verb} ${project}`;
}

/** A deploy that failed: a rollout failure says the release is live where it was received, not that nothing landed. */
export function reportDeployFailure(
	project: string,
	error: unknown,
	verb: DeployVerb,
	options: DeployToastOptions = {},
): void {
	if (error instanceof DeployRolloutError) {
		toast.error(`${project} did not reach every node`, { ...options, description: error.message });
		return;
	}
	toast.error(deployFailureTitle(error, project, verb), {
		...options,
		description: isUnansweredWrite(error)
			? UNANSWERED_WRITE_MESSAGE
			: error instanceof Error
			? error.message
			: undefined,
	});
}

/** A stage (5.3.0+) succeeds only once every node confirmed it, and changes nothing that is running. */
export function reportStaged(
	project: string,
	result: DeployComponentResult | undefined,
	options: DeployToastOptions = {},
): void {
	const id = result?.deployment_id;
	reportDeployResult(project, result, {
		title: `${project} staged`,
		warningTitle: `${project} staged with warnings`,
		description: `${id ? `Deployment ${id}` : 'It'} is installed on every node, waiting to be activated.`,
	}, options);
}

function reportUnfollowable(
	project: string,
	result: DeployComponentResult | undefined,
	options: DeployToastOptions,
): boolean {
	if (result?.rollout?.state !== 'unfollowable') {
		return false;
	}
	toast.warning(`${project} deployed on the node that received it`, {
		...options,
		description: describeUnfollowable(result.rollout),
	});
	return true;
}
