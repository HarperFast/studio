import { ComponentHealthResult } from '@/features/instance/applications/hooks/useComponentHealthCheck';
import { toast } from 'sonner';

/**
 * Surface the post-deploy health-check result as a toast.
 *
 * The new `deploy_component` returns before the component finishes loading on worker
 * threads, so a successful deploy call doesn't guarantee a working component (#1233). This
 * translates the polled status into clear user feedback.
 */
export function reportDeployHealth(project: string, health: ComponentHealthResult): void {
	switch (health.level) {
		case 'healthy':
			toast.success(`${project} deployed and healthy`, { description: health.message });
			return;
		case 'warning':
			toast.warning(`${project} deployed with warnings`, {
				description: health.message ?? 'The component loaded but reported a warning.',
			});
			return;
		case 'error':
			toast.error(`${project} deployed but failed to load`, {
				description: health.message ?? 'The component reported an error after deploying.',
			});
			return;
		case 'loading':
		case 'unknown':
		case 'indeterminate':
		default:
			toast.success(`${project} deployed`, {
				description: 'Still verifying — the component is loading. Check its status shortly.',
			});
			return;
	}
}
