import { DeploymentPeerResult } from '@/integrations/api/instance/deployments/types';

/**
 * Whether a node installed what the node that received the deploy did (5.3.1+). Harper adds the comparison only
 * on a deploy or a stage that compared fingerprints, so a record without it says nothing either way.
 */
export function describePeerInstall(
	peer: DeploymentPeerResult,
): { label: string; matches: boolean | null } | undefined {
	if (!('install_matches' in peer)) {
		return undefined;
	}
	if (peer.install_matches === true) {
		return { label: 'Installed the same as the node that received the deploy.', matches: true };
	}
	if (peer.install_matches === false) {
		const differs = (peer.install_differs ?? []).map((field) =>
			field === 'source' && peer.install?.source ? `source ${peer.install.source}` : field
		);
		return {
			label: `Installed differently: ${differs.length ? differs.join(', ') : 'see the deploy log'}.`,
			matches: false,
		};
	}
	return { label: "Couldn't compare its install: a fingerprint is missing or unidentified.", matches: null };
}
