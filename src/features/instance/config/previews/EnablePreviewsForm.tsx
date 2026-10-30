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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radioGroup';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { authStore, EntityIds } from '@/features/auth/store/authStore';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import {
	EnablePreviewsRequest,
	EnablePreviewsResponse,
	useEnablePreviews,
} from '@/integrations/api/instance/previews/previews';
import { GitHubRepositoryLookup, useGitHubRepositoryLookup } from '@/integrations/github/lookUpGitHubRepository';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { describeError } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { defaultPreviewDomain, previewAudience } from './previewAudience';
import { SharedDataWarning } from './PreviewWarnings';

const DEFAULT_BRANCH = 'main';
const DEFAULT_MAX_TTL_DAYS = '7';

const positiveNumber = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;

const schema = z.object({
	repository: z.string().trim().min(1, { error: 'Enter the GitHub repository.' }),
	repositoryId: z.string().trim().regex(/^([1-9]\d{0,19})?$/, { error: 'Enter the numeric id.' }),
	branch: z.string().trim().min(1, { error: 'Enter the branch.' }),
	dataMode: z.enum(['branched', 'shared']),
	maxPreviews: z.string().trim().refine(
		(value) => value === '' || (positiveNumber(value) && Number.isInteger(Number(value))),
		{ error: 'Enter a whole number above zero, or leave it empty.' },
	),
	maxTtlDays: z.string().trim().refine(positiveNumber, { error: 'Enter a number of days above zero.' }),
	hostSuffix: z.string().trim(),
});

type EnablePreviewsValues = z.infer<typeof schema>;

export function buildEnablePreviewsRequest(
	values: EnablePreviewsValues,
	{ app, repository, repositoryId, audience, needsHostSuffix }: {
		app: string;
		repository: string;
		repositoryId: string;
		audience: string;
		needsHostSuffix: boolean;
	},
): EnablePreviewsRequest {
	const { branch, dataMode, maxPreviews, maxTtlDays, hostSuffix } = values;
	return {
		app,
		repository,
		repository_id: repositoryId,
		branch,
		audience,
		dataMode,
		maxTtlDays: Number(maxTtlDays),
		...(maxPreviews && { maxPreviews: Number(maxPreviews) }),
		...(needsHostSuffix && { hostSuffix: `.${hostSuffix.replace(/^\.+/, '')}` }),
	};
}

/**
 * The cluster's own URL, also when this page is one instance of it: previews belong to the cluster. Only Local Studio,
 * which Harper serves from its operations port, can use the page's origin. Anywhere else that is Studio's own host, and
 * an audience no token is ever requested for.
 */
function useAudience(entityId: EntityIds): string | undefined {
	const { clusterId }: { clusterId?: EntityIds } = useParams({ strict: false });
	const { data: cluster } = useQuery(getClusterInfoQueryOptions(clusterId, false));
	return previewAudience(
		getOperationsUrlForCluster(cluster)
			?? authStore.getOperationsUrl(clusterId ?? entityId)
			?? (isLocalStudio ? window.location.origin : undefined),
	);
}

function RepositoryLookupMessage(
	{ fullName, lookup }: { fullName: string | undefined; lookup: GitHubRepositoryLookup | undefined },
) {
	if (!fullName) {
		return <FormDescription>The owner and name, such as acme/shop, or the repository's URL.</FormDescription>;
	}
	if (!lookup) {
		return <FormDescription>Looking {fullName} up on GitHub…</FormDescription>;
	}
	if (lookup.status === 'found') {
		return <FormDescription>{lookup.repository.fullName}, id {lookup.repository.id}.</FormDescription>;
	}
	return (
		<FormDescription>
			{lookup.status === 'not-found'
				? `GitHub doesn't show ${fullName} publicly. If it's private, enter its id below. Otherwise, check the name.`
				: lookup.status === 'rate-limited'
				? "GitHub's limit on lookups from this address was reached, so enter the id below."
				: "GitHub couldn't be reached, so enter the id below."}
		</FormDescription>
	);
}

export function EnablePreviewsForm(
	{ app, onEnabled }: { app: string; onEnabled: (enabled: EnablePreviewsResponse) => void },
) {
	const instanceParams = useInstanceClientIdParams();
	const { instanceClient, entityId } = instanceParams;
	const audience = useAudience(entityId);
	const needsHostSuffix = !!audience && !defaultPreviewDomain(audience);
	const { mutateAsync: enablePreviews, isPending } = useEnablePreviews();
	const [failure, setFailure] = useState<string>();

	const form = useForm({
		resolver: zodResolver(schema),
		mode: 'onTouched',
		defaultValues: {
			repository: '',
			repositoryId: '',
			branch: DEFAULT_BRANCH,
			dataMode: 'branched' as const,
			maxPreviews: '',
			maxTtlDays: DEFAULT_MAX_TTL_DAYS,
			hostSuffix: '',
		},
	});
	const { fullName, lookup } = useGitHubRepositoryLookup(form.watch('repository'));
	const dataMode = form.watch('dataMode');
	const found = lookup?.status === 'found' ? lookup.repository : undefined;
	const needsId = !!lookup && !found;

	// The default branch is what the workflow runs from, so each answer replaces the branch unless someone typed theirs.
	const foundBranch = found?.defaultBranch;
	useEffect(() => {
		if (lookup && !form.getFieldState('branch').isDirty) {
			form.setValue('branch', foundBranch ?? DEFAULT_BRANCH);
		}
	}, [lookup, foundBranch, form]);

	// The field is gone once the repository is found, and a bad value left in it would still fail validation, unseen.
	const foundId = found?.id;
	useEffect(() => {
		if (foundId) {
			form.setValue('repositoryId', '');
			form.clearErrors('repositoryId');
		}
	}, [foundId, form]);

	const onSubmit = async (values: EnablePreviewsValues) => {
		setFailure(undefined);
		if (!audience) {
			return;
		}
		if (!fullName) {
			form.setError('repository', { message: 'Enter the repository as owner/name.' });
			return;
		}
		if (!lookup) {
			form.setError('repository', { message: `Still looking ${fullName} up. Try again in a moment.` });
			return;
		}
		const repositoryId = found?.id ?? values.repositoryId;
		if (!repositoryId) {
			form.setError('repositoryId', { message: 'Enter the numeric id.' });
			return;
		}
		if (needsHostSuffix && !values.hostSuffix.replace(/^\.+/, '')) {
			form.setError('hostSuffix', { message: 'Enter the domain previews are served under.' });
			return;
		}
		try {
			const enabled = await enablePreviews({
				instanceClient,
				request: buildEnablePreviewsRequest(values, {
					app,
					repository: found?.fullName ?? fullName,
					repositoryId,
					audience,
					needsHostSuffix,
				}),
			});
			toast.success(enabled.message);
			onEnabled(enabled);
		} catch (error) {
			setFailure(describeError(error).message);
		}
	};

	if (!audience) {
		return (
			<Alert variant="destructive">
				<AlertDescription>
					Studio doesn't know this cluster's operations URL, which GitHub Actions has to request its token for. Previews
					can't be set up here.
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<Form {...form}>
			<form
				aria-label="Enable previews"
				noValidate
				className="grid max-w-xl gap-4 rounded-md border p-4"
				onSubmit={form.handleSubmit(onSubmit)}
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
						name="repositoryId"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Repository id</FormLabel>
								<FormControl>
									<Input inputMode="numeric" autoComplete="off" {...field} />
								</FormControl>
								<FormDescription>
									<code className="font-mono">gh api repos/{fullName} --jq '.id, .full_name'</code>{' '}
									prints it, and GitHub's exact spelling of the name, which the repository above has to match.
								</FormDescription>
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
							<FormDescription>The default branch, which holds the workflow.</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="dataMode"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Data</FormLabel>
							<FormControl>
								<RadioGroup value={field.value} onValueChange={field.onChange}>
									<label className="flex cursor-pointer items-start gap-2 text-sm">
										<RadioGroupItem value="branched" className="mt-0.5" />
										<span>Branched: each preview gets its own copy of the databases</span>
									</label>
									<label className="flex cursor-pointer items-start gap-2 text-sm">
										<RadioGroupItem value="shared" className="mt-0.5" />
										<span>Shared: previews use the cluster's databases</span>
									</label>
								</RadioGroup>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				{dataMode === 'shared' && <SharedDataWarning />}
				<div className="grid gap-4 sm:grid-cols-2">
					<FormField
						control={form.control}
						name="maxPreviews"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Most previews at once</FormLabel>
								<FormControl>
									<Input type="number" min={1} step={1} {...field} />
								</FormControl>
								<FormDescription>Empty keeps the cluster's default.</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="maxTtlDays"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Longest life, in days</FormLabel>
								<FormControl>
									<Input type="number" min={0} step="any" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
				{needsHostSuffix && (
					<FormField
						control={form.control}
						name="hostSuffix"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Preview domain</FormLabel>
								<FormControl>
									<Input placeholder="app.example.com" autoComplete="off" {...field} />
								</FormControl>
								<FormDescription>
									This cluster's URL isn't a host name, so say which domain previews are served under.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>
				)}
				<p className="text-sm text-muted-foreground">
					GitHub Actions will sign in to <code className="break-all font-mono">{audience}</code>
				</p>
				{failure && (
					<Alert variant="destructive">
						<AlertDescription className="whitespace-pre-wrap">{failure}</AlertDescription>
					</Alert>
				)}
				<div>
					<Button type="submit" disabled={isPending}>Enable previews</Button>
				</div>
			</form>
		</Form>
	);
}
