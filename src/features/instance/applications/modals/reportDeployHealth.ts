import {
	describeCertification,
	describeUnfollowable,
} from '@/features/instance/applications/components/DeployProgress/describeDeployOutcome';
import { ComponentHealthResult } from '@/features/instance/applications/hooks/useComponentHealthCheck';
import { DeployComponentResult } from '@/integrations/api/instance/applications/deployComponentStream';
import { toast } from 'sonner';

/** What else the deploy said, beyond the component's health. `warn` when a person should look at it. */
export interface DeployNotes {
	lines: string[];
	warn: boolean;
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
): void {
	switch (health.level) {
		case 'healthy':
			if (notes.warn) {
				toast.warning(`${project} deployed with warnings`, { description: withNotes(health.message, notes) });
				return;
			}
			toast.success(`${project} deployed and healthy`, { description: withNotes(health.message, notes) });
			return;
		case 'warning':
			toast.warning(`${project} deployed with warnings`, {
				description: withNotes(health.message ?? 'The component loaded but reported a warning.', notes),
			});
			return;
		case 'error':
			toast.error(`${project} deployed but failed to load`, {
				description: withNotes(health.message ?? 'The component reported an error after deploying.', notes),
			});
			return;
		case 'loading':
		case 'unknown':
		case 'indeterminate':
		default:
			toast.success(`${project} deployed`, {
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
): Promise<boolean> {
	if (result?.rollout?.state === 'unfollowable') {
		toast.warning(`${project} deployed on the node that received it`, {
			description: describeUnfollowable(result.rollout),
		});
		return false;
	}
	reportDeployHealth(project, await runHealthCheck(project), deployNotes(result));
	return true;
}
