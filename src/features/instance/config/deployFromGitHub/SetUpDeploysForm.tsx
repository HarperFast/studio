import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { revealFieldErrorOnEnter } from '@/components/ui/form/revealFieldErrorOnEnter';
import { Input } from '@/components/ui/input';
import { isPrivateAudience } from '@/features/instance/config/githubActions/actionsAudience';
import {
	RepositoryIdentityHint,
	RepositoryLookupMessage,
	resolveRepositoryIdentity,
} from '@/features/instance/config/githubActions/RepositoryInput';
import {
	canonicalCiDeployWorkflow,
	CiDeploySource,
	DEFAULT_CI_DEPLOY_BRANCH,
	DEFAULT_CI_DEPLOY_ENVIRONMENT,
	DEFAULT_CI_DEPLOY_WORKFLOW,
	isCiDeployBranch,
	isCiDeployEnvironment,
} from '@/integrations/api/instance/ciDeploy/ciDeploy';
import { useGitHubRepositoryLookup } from '@/integrations/github/lookUpGitHubRepository';
import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlertIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const schema = z.object({
	repository: z.string().trim().min(1, { error: 'Enter the GitHub repository.' }),
	repositoryIdentity: z.string().trim(),
	branch: z.string().trim().refine(isCiDeployBranch, {
		error: 'Enter a branch made of letters, numbers, ".", "_", "-" and "/".',
	}),
	environment: z.string().trim().refine(isCiDeployEnvironment, {
		error: 'Enter an environment made of letters, numbers, ".", "_" and "-".',
	}),
	workflow: z.string().trim().refine((value) => canonicalCiDeployWorkflow(value) !== undefined, {
		error: 'Enter a .yml or .yaml file directly in .github/workflows/, where GitHub reads workflows.',
	}),
});

type SetUpDeploysValues = z.infer<typeof schema>;

export function SetUpDeploysForm({ audience, defaultRepository, pending, onSubmit }: {
	audience: string;
	defaultRepository?: string;
	pending: boolean;
	onSubmit: (source: CiDeploySource) => void;
}) {
	const form = useForm({
		resolver: zodResolver(schema),
		mode: 'onTouched',
		defaultValues: {
			repository: defaultRepository ?? '',
			repositoryIdentity: '',
			branch: DEFAULT_CI_DEPLOY_BRANCH,
			environment: DEFAULT_CI_DEPLOY_ENVIRONMENT,
			workflow: DEFAULT_CI_DEPLOY_WORKFLOW,
		},
	});
	const { fullName, lookup } = useGitHubRepositoryLookup(form.watch('repository'));
	const branch = form.watch('branch').trim();
	const found = lookup?.status === 'found' ? lookup.repository : undefined;
	const needsId = !!lookup && !found;
	const otherDefaultBranch = found?.defaultBranch && found.defaultBranch !== branch ? found.defaultBranch : undefined;

	const submit = (values: SetUpDeploysValues) => {
		const resolved = resolveRepositoryIdentity({ fullName, lookup, pasted: values.repositoryIdentity });
		if (!('identity' in resolved)) {
			form.setError(resolved.field, { message: resolved.message });
			return;
		}
		onSubmit({
			repositoryId: resolved.identity.id,
			repository: resolved.identity.fullName,
			workflow: canonicalCiDeployWorkflow(values.workflow) as string,
			branch: values.branch,
			environment: values.environment,
		});
	};

	return (
		<Form {...form}>
			<form
				aria-label="Set up deploys from GitHub"
				noValidate
				className="grid max-w-xl gap-4 rounded-md border p-4"
				onSubmit={form.handleSubmit(submit)}
				onKeyDown={revealFieldErrorOnEnter(form)}
			>
				<FormField
					control={form.control}
					name="repository"
					render={({ field }) => (
						<FormItem>
							<FormLabel>GitHub repository</FormLabel>
							<FormControl>
								<Input placeholder="owner/name" autoComplete="off" {...field} />
							</FormControl>
							<RepositoryLookupMessage fullName={fullName} lookup={lookup} />
							<FormMessage />
						</FormItem>
					)}
				/>
				{needsId && (
					<FormField
						control={form.control}
						name="repositoryIdentity"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Repository id and name</FormLabel>
								<FormControl>
									<Input placeholder="123456 owner/name" autoComplete="off" {...field} />
								</FormControl>
								<RepositoryIdentityHint fullName={fullName} />
								<FormMessage />
							</FormItem>
						)}
					/>
				)}
				<FormField
					control={form.control}
					name="branch"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Branch</FormLabel>
							<FormControl>
								<Input autoComplete="off" {...field} />
							</FormControl>
							<FormDescription>
								{otherDefaultBranch
									? `The repository's default branch is ${otherDefaultBranch}. Merges to this branch deploy.`
									: 'Merges to this branch deploy.'}
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="environment"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Environment</FormLabel>
							<FormControl>
								<Input autoComplete="off" {...field} />
							</FormControl>
							<FormDescription>The GitHub environment the deploy job runs in.</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="workflow"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Workflow file</FormLabel>
							<FormControl>
								<Input autoComplete="off" {...field} />
							</FormControl>
							<FormDescription>Only runs of this file can deploy.</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>
				<p className="text-sm text-muted-foreground">
					GitHub Actions will sign in to <code className="break-all font-mono">{audience}</code>
				</p>
				{isPrivateAudience(audience) && (
					<Alert variant="warning">
						<TriangleAlertIcon />
						<AlertDescription>
							GitHub's hosted runners can't reach this address, so only a self-hosted runner on its network could
							deploy.
						</AlertDescription>
					</Alert>
				)}
				<Button type="submit" className="w-fit" disabled={pending}>Set up deploys</Button>
			</form>
		</Form>
	);
}
