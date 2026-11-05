import { isLocalStudio } from '@/config/constants';
import { useInstanceClientParams } from '@/config/useInstanceClient';
import { Cluster, Instance } from '@/integrations/api/api.patch';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { useRouteContext } from '@tanstack/react-router';
import { useMemo } from 'react';

export interface CLIStep {
	title: string;
	code: string;
	note?: string;
}

/**
 * The steps follow create-harper's own outro (`lib/steps/installAndOptionallyStart.js`): it takes the cluster URL and
 * scaffolds a workflow that deploys on each merge to `main`. A super user's `harper login` lets `deploy:setup-ci`
 * create the trust policy that workflow signs in with, so neither the project nor GitHub holds a password.
 */
export function buildCLISteps(appName: string, target: string | null | undefined): CLIStep[] {
	const directoryName = toKebabCase(appName);
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
		{
			title: 'Sign in to your cluster as a super user',
			code: 'harper login',
			note: 'It saves a token in your home directory, so no password goes into your project.',
		},
		{
			title: 'Let GitHub Actions deploy it',
			code: 'npm run deploy:setup-ci',
			note: 'Push the project to a GitHub repository first. This creates the trust policy its deploy workflow signs in'
				+ " with, and sets the repository's HARPER_CLI_TARGET variable, so GitHub stores no Harper credential. The"
				+ " application's Deploy from GitHub page in Studio can set up the cluster side too.",
		},
		{
			title: 'Deploy!',
			code: 'git push origin main',
			note: "Every merge to main deploys. Your project's README explains it in its Deployment section.",
		},
	];
}

export function useCLISteps(appName: string) {
	const instanceParams = useInstanceClientParams();
	const { instance, cluster }: { instance?: Instance; cluster?: Cluster } = useRouteContext({ strict: false });
	const target = isLocalStudio
		? instanceParams.instanceClient.defaults.baseURL
		: instance
		? getOperationsUrlForInstance(instance)
		: getOperationsUrlForCluster(cluster);

	return useMemo(() => buildCLISteps(appName, target), [appName, target]);
}
