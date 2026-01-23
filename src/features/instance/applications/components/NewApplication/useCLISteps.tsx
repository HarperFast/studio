import { isLocalStudio } from '@/config/constants';
import { useInstanceClientParams } from '@/config/useInstanceClient';
import { useInstanceAuth } from '@/hooks/useAuth';
import { Cluster, Instance } from '@/integrations/api/api.patch';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { useRouteContext } from '@tanstack/react-router';
import { useMemo } from 'react';

export function useCLISteps(appName: string) {
	const { user } = useInstanceAuth();
	const instanceParams = useInstanceClientParams();
	const { instance, cluster }: { instance?: Instance; cluster?: Cluster } = useRouteContext({ strict: false });
	const target = isLocalStudio
		? instanceParams.instanceClient.defaults.baseURL
		: instance
		? getOperationsUrlForInstance(instance)
		: getOperationsUrlForCluster(cluster);

	return useMemo(() => {
		const directoryName = toKebabCase(appName);
		const createArgs = [
			user?.username && ` --deploymentUsername="${user?.username}"`,
			target && ` --deploymentURL="${target}"`,
		].filter(excludeFalsy).join('');
		return [
			{
				title: 'Install or update the Harper CLI',
				code: 'npm install -g harperdb',
			},
			{
				title: 'Create your awesome app',
				code: `npm create harper ${directoryName}${createArgs.length ? ' --' : ''}${createArgs}`,
				note: 'You will be asked some easy questions to get you started. To make deployments easy, enter your'
					+ ' password for this cluster. It will get saved into your local .env file.',
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
				note: 'Remember that .env file? It makes this deployment easy!',
			},
		];
	}, [appName, target, user?.username]);
}
