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
 * The steps follow create-harper's own flow: it takes the cluster URL, offers to run `harper login`,
 * and stores no username or password in the project.
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
			note: 'You will be asked some easy questions to get you started. When it offers to log in to this cluster,'
				+ ' say yes: harper login saves a token in your home directory, so no password goes into your project.',
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
			title: 'Deploy!',
			code: `npm run deploy`,
			note: "It signs in with the login from step 2. Your project's README explains what a deploy needs in its"
				+ ' Deployment section.',
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
