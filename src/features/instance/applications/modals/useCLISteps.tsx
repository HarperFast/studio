import { useInstanceAuth } from '@/hooks/useAuth';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { useMemo } from 'react';

export function useCLISteps(appName: string, target: string | undefined) {
	const { user } = useInstanceAuth();
	return useMemo(() => {
		const directoryName = toKebabCase(appName);
		return [
			{
				title: 'Install Harper CLI',
				code: 'npm install -g harperdb',
			},
			{
				title: 'Clone Template',
				code: `git clone https://github.com/HarperFast/application-template.git ${directoryName}
cd ${directoryName}`,
			},
			{
				title: 'Start Local Harper Instance',
				code: 'npm run dev',
				alert: 'You will be prompted to configure your instance',
			},
			{
				title: 'Make Changes!',
				code: `pico schema.graphql`,
			},
			{
				title: 'Configure your .env file',
				code: `npm run login ${user?.username}@${target}`,
				note: `Your credentials are your own! Remember to exclude the .env file from source control.`,
			},
			{
				title: 'Deploy Application',
				code: `npm run deploy`,
			},
		];
	}, [appName, target]);
}
