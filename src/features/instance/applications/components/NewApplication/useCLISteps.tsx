import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { isPrivateAudience } from '@/features/instance/config/githubActions/actionsAudience';
import { Cluster, Instance } from '@/integrations/api/api.patch';
import { supportsCiDeploy } from '@/integrations/api/instance/ciDeploy/ciDeploy';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useMemo } from 'react';

export interface CLIStep {
	title: string;
	code: string;
	note?: string;
}

const LOGIN_STEP: CLIStep = {
	title: 'Sign in to your cluster as a super user',
	code: 'harper login',
	note: 'It saves a token in your home directory, so no password goes into your project.',
};

/**
 * The steps follow create-harper's own outro (`lib/steps/installAndOptionallyStart.js`): it takes the cluster URL and
 * scaffolds a workflow that deploys on each merge to `main`, once `deploy:setup-ci` has created the trust policy the
 * workflow signs in with. A cluster too old for that, or one GitHub's runners can't reach (`ciDeploy` false), deploys
 * from the laptop instead, with the same login. Until Studio knows which (`undefined`), it shows neither.
 */
export function buildCLISteps(
	appName: string,
	target: string | null | undefined,
	ciDeploy: boolean | undefined,
): CLIStep[] {
	const directoryName = toKebabCase(appName);
	const deploySteps: CLIStep[] = ciDeploy === undefined
		? []
		: ciDeploy
		? [
			LOGIN_STEP,
			{
				title: 'Let GitHub Actions deploy it',
				code: 'npm run deploy:setup-ci',
				note:
					'Push the project to a GitHub repository first. This creates the trust policy its deploy workflow signs in'
					+ " with and sets the repository's HARPER_CLI_TARGET variable, so GitHub stores no Harper credential. It needs"
					+ ' the Harper CLI 5.4 or later: until 5.4 is released, install it with npm install -g harper@next. Deploy from GitHub,'
					+ " on this cluster's Config page, sets up the cluster side without the CLI.",
			},
			{
				title: 'Deploy!',
				code: 'git push origin main',
				note: "Every merge to main deploys. Your project's README explains it in its Deployment section.",
			},
		]
		: [
			LOGIN_STEP,
			{
				title: 'Deploy!',
				code: 'npm run deploy',
				note: 'It signs in with the login from the step before.',
			},
		];
	return [
		{
			title: 'Install or update the Harper CLI',
			code: 'npm install -g harper',
		},
		{
			title: 'Create your awesome app',
			code: `npm create harper ${directoryName}${target ? ` -- --deploymentURL="${target}"` : ''}`,
			note: 'You will be asked some easy questions to get you started.',
		},
		{
			title: 'Start local Harper instance',
			code: 'npm run dev',
			note: 'You will be prompted to configure Harper.',
		},
		{
			title: 'Learn, make changes, grow!',
			code: `cat AGENTS.md`,
		},
		...deploySteps,
	];
}

export function useCLISteps(appName: string) {
	const instanceParams = useInstanceClientIdParams();
	const { instance, cluster }: { instance?: Instance; cluster?: Cluster } = useRouteContext({ strict: false });
	const { data: registrationInfo, isPending } = useQuery(getRegistrationInfoQueryOptions(instanceParams));
	const target = isLocalStudio
		? instanceParams.instanceClient.defaults.baseURL
		: instance
		? getOperationsUrlForInstance(instance)
		: getOperationsUrlForCluster(cluster);
	// An unreadable version deploys from the laptop; a private address, Local Studio's included, too.
	const ciDeploy = isPending
		? undefined
		: !isLocalStudio && !(target && isPrivateAudience(target)) && supportsCiDeploy(registrationInfo?.version);

	return useMemo(() => buildCLISteps(appName, target, ciDeploy), [appName, target, ciDeploy]);
}
