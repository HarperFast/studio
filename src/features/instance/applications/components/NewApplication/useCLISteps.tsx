import { toKebabCase } from '@/lib/string/to-kebab-case';
import { useMemo } from 'react';
import { useCiDeployOutro } from './useCiDeployOutro';

export interface CLIStep {
	title: string;
	code: string;
	note?: string;
}

/** The template chosen on the Templates tab, for create-harper's `--template`. */
export interface CLITemplate {
	id: string;
	name: string;
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
	template?: CLITemplate,
): CLIStep[] {
	const directoryName = toKebabCase(appName);
	const createFlags = [template && `--template ${template.id}`, target && `--deploymentURL="${target}"`].filter(
		Boolean,
	);
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
			code: `npm create harper ${directoryName}${createFlags.length ? ` -- ${createFlags.join(' ')}` : ''}`,
			note: template
				? `It starts from the ${template.name} template, then asks a few easy questions.`
				: 'You will be asked some easy questions to get you started.',
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

export function useCLISteps(appName: string, template?: CLITemplate) {
	const { target, ciDeploy } = useCiDeployOutro();
	return useMemo(() => buildCLISteps(appName, target, ciDeploy, template), [appName, target, ciDeploy, template]);
}
