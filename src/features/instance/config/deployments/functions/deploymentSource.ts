import { Deployment } from '@/integrations/api/instance/deployments/types';

export function shortDeploymentId(id: string): string {
	return id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * Where a release came from. A package deploy records its reference and a payload deploy its tarball's hash; an
 * activation (5.3.0+) builds nothing, so it names the deployment whose release it made live.
 */
export function deploymentSource(deployment: Deployment): { label: string; title: string } | undefined {
	if (deployment.activated_from) {
		return {
			label: `Activation of ${shortDeploymentId(deployment.activated_from)}`,
			title: deployment.activated_from,
		};
	}
	if (deployment.package_identifier) {
		return { label: deployment.package_identifier, title: deployment.package_identifier };
	}
	if (deployment.payload_hash) {
		return { label: `Payload ${deployment.payload_hash.slice(0, 12)}`, title: deployment.payload_hash };
	}
	return undefined;
}
