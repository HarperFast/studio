import { DeploymentSource } from '@/integrations/api/instance/deployments/types';

interface DescribedSource {
	/** Whether the OIDC exchange attested it, or the client only declared it. */
	attested: boolean;
	via: string;
	viaDetail: string;
	sha?: string;
	shortSha?: string;
	commitUrl?: string;
	repository?: string;
	ref?: string;
	run?: { label: string; url?: string };
	actor?: string;
	environment?: string;
	dirty?: boolean;
}

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;
const SHA = /^[0-9a-f]{7,64}$/i;
const NUMBER = /^\d+$/;

/**
 * GitHub links only for a source whose `workflow_ref` is GitHub's own `<owner>/<repo>/.github/workflows/...` of the
 * same repository: another issuer supplies the claims it has under these names, and a repository path alone does not
 * say which host it lives on.
 */
function onGitHub(source: DeploymentSource): boolean {
	return !!source.repository && REPOSITORY.test(source.repository)
		&& !!source.workflow_ref?.startsWith(`${source.repository}/.github/workflows/`);
}

export function describeSource(source: DeploymentSource): DescribedSource {
	const attested = source.via === 'oidc';
	const github = onGitHub(source);
	const base = github ? `https://github.com/${source.repository}` : undefined;
	const sha = typeof source.sha === 'string' && source.sha ? source.sha : undefined;
	const runId = source.run_id;
	const attempt = source.run_attempt && source.run_attempt !== '1' ? ` (attempt ${source.run_attempt})` : '';
	return {
		attested,
		via: attested ? 'OIDC' : 'Declared',
		viaDetail: attested
			? `Attested: the CI identity token was verified and matched trust policy ${source.policy ?? '(unnamed)'}.`
			: 'Declared by the client that deployed it. Nothing verified it.',
		sha,
		shortSha: sha && SHA.test(sha) ? sha.slice(0, 7) : sha,
		commitUrl: base && sha && SHA.test(sha) ? `${base}/commit/${sha}` : undefined,
		repository: source.repository,
		ref: source.ref,
		run: runId
			? {
				label: `${source.workflow_ref?.split('@')[0].split('/').pop() || 'Run'} #${runId}${attempt}`,
				url: base && NUMBER.test(runId)
					? `${base}/actions/runs/${runId}${
						source.run_attempt && NUMBER.test(source.run_attempt) ? `/attempts/${source.run_attempt}` : ''
					}`
					: undefined,
			}
			: undefined,
		actor: source.actor,
		environment: source.environment,
		dirty: source.dirty,
	};
}
