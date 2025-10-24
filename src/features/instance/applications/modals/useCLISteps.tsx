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
				code: `git clone https://github.com/HarperFast/application-template ${directoryName}
cd ${directoryName}`,
				alert: 'The .git steps will help you set up your own repo',
			},
			{
				title: 'Start Local Harper Instance',
				code: 'harperdb dev .',
				note: 'You will be prompted to configure your instance',
			},
			{
				title: 'Make Changes!',
				code: `pico schema.graphql`,
			},
			{
				title: 'Supply your credentials securely',
				code: `echo -n Password:
read -s password
echo`,
			},
			{
				title: 'Deploy Application',
				code: `CLI_TARGET_USERNAME='${user?.username || 'YOUR_USERNAME'}' CLI_TARGET_PASSWORD=$password harperdb deploy_component target='${target}' restart=rolling replicated=true`,
				alert: 'Make sure you are in your application directory before running the deploy command',
			},
		];
	}, [appName, target]);
}
