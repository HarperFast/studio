import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { apiClient } from '@/config/apiClient';
import { OrgPageLayout } from '@/features/organization/components/OrgPageLayout';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useCloudAuth } from '@/hooks/useAuth';
import { writeToClipboard } from '@/hooks/useCopyToClipboard';
import { useOrganizationPermissions } from '@/hooks/usePermissions';
import { SchemaOrganization } from '@/integrations/api/api.gen';
import { OAuthConfig } from '@/integrations/api/api.patch';
import { getOAuthSignInUrl } from '@/lib/urls/getOAuthSignInUrl';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { CopyIcon, ExternalLinkIcon, PencilIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

// PATCH /Organization/{orgId}/settings/oauth
// id absent = create, id present = update. provider is required on every call.
async function patchOAuthConfig(orgId: string, payload: Partial<OAuthConfig> & { provider: string }) {
	const { data } = await apiClient.patch(
		`/Organization/${orgId}/settings/oauth` as '/Organization/{id}',
		payload as unknown as SchemaOrganization,
	);
	return data as unknown as OAuthConfig;
}

// ── Add form ──────────────────────────────────────────────────────────────────

const addSchema = z.object({
	domain: z.string().min(1, 'Domain is required'),
	clientId: z.string().min(1, 'Client ID is required'),
	clientSecret: z.string().min(1, 'Client secret is required'),
	scope: z.string().optional(),
	// required is always false on creation — admin must sign in via the provider first
});
type AddForm = z.infer<typeof addSchema>;

// ── Edit form ─────────────────────────────────────────────────────────────────

const editSchema = z.object({
	domain: z.string().min(1, 'Domain is required'),
	// blank = keep existing (server ignores absent fields; don't echo masked '****' back)
	clientId: z.string().optional(),
	clientSecret: z.string().optional(),
	scope: z.string().optional(),
});
type EditForm = z.infer<typeof editSchema>;

// ── Component ─────────────────────────────────────────────────────────────────

export function OrgSettingsIndex() {
	const { organizationId } = useParams({ strict: false });
	const { user } = useCloudAuth();
	const { update: canUpdate } = useOrganizationPermissions(organizationId);
	const { data: organization } = useSuspenseQuery(getOrganizationQueryOptions(organizationId));
	const queryClient = useQueryClient();

	const [isAdding, setIsAdding] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	const configs: OAuthConfig[] = organization.settings?.oauthConfigs ?? [];

	const { mutate: patch, isPending } = useMutation({
		mutationFn: (payload: Partial<OAuthConfig> & { provider: string }) => patchOAuthConfig(organizationId, payload),
		onSuccess: () => void queryClient.invalidateQueries({ queryKey: [organizationId] }),
		onError: () => toast.error('Failed to update OAuth settings.'),
	});

	// Add
	const addForm = useForm<AddForm>({
		resolver: zodResolver(addSchema),
		defaultValues: { domain: '', clientId: '', clientSecret: '', scope: 'openid email profile' },
	});

	const onAdd = (data: AddForm) => {
		patch(
			{ provider: 'okta', ...data },
			{
				onSuccess: () => {
					toast.success('OAuth provider added.');
					addForm.reset();
					setIsAdding(false);
				},
			},
		);
	};

	// Edit
	const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });

	const startEdit = (config: OAuthConfig) => {
		setEditingId(config.id ?? null);
		editForm.reset({ domain: config.domain, clientId: '', clientSecret: '', scope: config.scope ?? '' });
	};

	const onEdit = (config: OAuthConfig, data: EditForm) => {
		const payload: Partial<OAuthConfig> & { provider: string; id: string } = {
			id: config.id!,
			provider: config.provider,
			domain: data.domain,
			scope: data.scope,
		};
		// Only include secrets if the user actually typed something (blank = keep existing)
		if (data.clientId) { payload.clientId = data.clientId; }
		if (data.clientSecret) { payload.clientSecret = data.clientSecret; }

		patch(payload, {
			onSuccess: () => {
				toast.success('OAuth provider updated.');
				setEditingId(null);
			},
		});
	};

	// Toggle enabled / required
	const toggleField = (config: OAuthConfig, field: 'enabled' | 'required') => {
		patch({
			id: config.id!,
			provider: config.provider,
			[field]: !config[field],
		});
	};

	const getCallbackUrl = (oauthConfigId: string) =>
		`${import.meta.env.VITE_CENTRAL_MANAGER_API_URL}/oauth/${oauthConfigId}/callback`;

	const copySignInUrl = async (url: string) => {
		if (await writeToClipboard(url)) {
			toast.success('Sign-in URL copied.');
		}
	};

	const copyCallbackUrl = async (url: string) => {
		if (await writeToClipboard(url)) {
			toast.success('Redirect URI copied.');
		}
	};

	if (!canUpdate) {
		return (
			<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))] text-foreground">
				You don&apos;t have permission to manage settings for this organization.
			</div>
		);
	}

	return (
		<>
			<SubNavMenu />
			<OrgPageLayout>
				<div className="max-w-2xl">
					<h2 className="text-2xl text-foreground font-light mb-6">Authentication</h2>

					<section>
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-lg text-foreground font-medium">OAuth Providers</h3>
							{!isAdding && (
								<Button variant="positiveOutline" size="sm" onClick={() => setIsAdding(true)}>
									<PlusIcon />
									Add Provider
								</Button>
							)}
						</div>

						{configs.length === 0 && !isAdding && (
							<p className="text-muted-foreground text-sm mb-4">No OAuth providers configured.</p>
						)}

						{/* Existing provider cards */}
						{configs.map((config) => {
							// Required can only be toggled when the admin is already authenticated
							// via this provider — otherwise they'd lock themselves out.
							const canToggleRequired = user?.oauthConfigId === config.id;
							return editingId === config.id
								? (
									/* ── Inline edit form ── */
									<div key={config.id} className="border rounded-lg p-4 mb-3 text-foreground">
										<div className="flex items-center justify-between mb-4">
											<h4 className="font-medium">Edit Provider</h4>
											<button
												type="button"
												onClick={() => setEditingId(null)}
												className="text-muted-foreground hover:text-foreground"
											>
												<XIcon className="size-4" />
											</button>
										</div>
										<Form {...editForm}>
											<form onSubmit={editForm.handleSubmit((d) => onEdit(config, d))} className="space-y-4">
												<FormField
													control={editForm.control}
													name="domain"
													render={({ field }) => (
														<FormItem>
															<FormLabel>Domain</FormLabel>
															<FormControl>
																<Input placeholder="company.okta.com" {...field} />
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={editForm.control}
													name="clientId"
													render={({ field }) => (
														<FormItem>
															<FormLabel>Client ID</FormLabel>
															<FormControl>
																<Input placeholder="Leave blank to keep existing" {...field} />
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={editForm.control}
													name="clientSecret"
													render={({ field }) => (
														<FormItem>
															<FormLabel>Client Secret</FormLabel>
															<FormControl>
																<Input type="password" placeholder="Leave blank to keep existing" {...field} />
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={editForm.control}
													name="scope"
													render={({ field }) => (
														<FormItem>
															<FormLabel>Scope</FormLabel>
															<FormControl>
																<Input placeholder="openid email profile" {...field} />
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<div className="flex gap-2 pt-2">
													<Button type="submit" variant="positive" disabled={isPending}>
														{isPending ? 'Saving...' : 'Save'}
													</Button>
													<Button type="button" variant="outline" onClick={() => setEditingId(null)}>
														Cancel
													</Button>
												</div>
											</form>
										</Form>
									</div>
								)
								: (
									/* ── Provider display card ── */
									<div key={config.id} className="border rounded-lg p-4 mb-3 text-foreground">
										<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2 mb-1">
													<span className="font-medium">{config.domain}</span>
													<span className="text-xs text-muted-foreground uppercase bg-muted px-2 py-0.5 rounded">
														{config.provider}
													</span>
													{config.enabled === false && (
														<span className="text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded">
															Disabled
														</span>
													)}
												</div>
												<p className="text-sm text-muted-foreground mb-2">
													Client ID: <span className="text-foreground font-mono">****</span>
												</p>
												{config.id && (
													<>
														<div className="mt-3 rounded-md bg-muted px-3 py-2">
															<p className="text-xs font-medium text-muted-foreground mb-1">
																Okta redirect URI
															</p>
															<p className="text-xs text-muted-foreground mb-1.5">
																Add to <span className="font-medium text-foreground">Login redirect URIs</span>{' '}
																in your Okta app settings.
															</p>
															<div className="flex items-center gap-2">
																<span className="text-sm text-foreground font-mono truncate">
																	{getCallbackUrl(config.id)}
																</span>
																<button
																	type="button"
																	onClick={() => void copyCallbackUrl(getCallbackUrl(config.id!))}
																	className="hover:text-foreground shrink-0 text-muted-foreground"
																	title="Copy redirect URI"
																>
																	<CopyIcon className="size-3.5" />
																</button>
															</div>
														</div>
														<div className="mt-2 rounded-md bg-muted px-3 py-2">
															<p className="text-xs font-medium text-muted-foreground mb-1.5">
																User login link
															</p>
															<div className="flex items-center gap-2">
																<a
																	href={getOAuthSignInUrl(config.id)}
																	target="_blank"
																	rel="noreferrer"
																	className="text-sm text-foreground truncate hover:underline"
																>
																	{getOAuthSignInUrl(config.id)}
																</a>
																<div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
																	<button
																		type="button"
																		onClick={() => void copySignInUrl(getOAuthSignInUrl(config.id!))}
																		className="hover:text-foreground"
																		title="Copy login link"
																	>
																		<CopyIcon className="size-3.5" />
																	</button>
																	<a
																		href={getOAuthSignInUrl(config.id)}
																		target="_blank"
																		rel="noreferrer"
																		className="hover:text-foreground"
																		title="Open login link"
																	>
																		<ExternalLinkIcon className="size-3.5" />
																	</a>
																</div>
															</div>
														</div>
													</>
												)}
											</div>
											<div className="flex items-center gap-3 sm:shrink-0">
												<label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
													<Switch
														checked={config.enabled !== false}
														onCheckedChange={() => toggleField(config, 'enabled')}
														disabled={isPending}
													/>
													Enabled
												</label>
												<Tooltip>
													<TooltipTrigger asChild>
														<span
															className={`inline-flex items-center gap-2 text-sm text-foreground ${
																canToggleRequired ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
															}`}
														>
															<Switch
																checked={!!config.required}
																onCheckedChange={() => toggleField(config, 'required')}
																disabled={isPending || !canToggleRequired}
															/>
															Required
														</span>
													</TooltipTrigger>
													{!canToggleRequired && (
														<TooltipContent>
															Sign in via {config.provider} first to enable Required
														</TooltipContent>
													)}
												</Tooltip>
												<Button
													variant="outline"
													size="sm"
													onClick={() => startEdit(config)}
													disabled={isPending}
												>
													<PencilIcon className="size-4" />
												</Button>
											</div>
										</div>
									</div>
								);
						})}

						{/* Add form */}
						{isAdding && (
							<div className="border rounded-lg p-4 text-foreground">
								<div className="flex items-center justify-between mb-4">
									<h4 className="font-medium">Add Okta Provider</h4>
									<button
										type="button"
										onClick={() => {
											setIsAdding(false);
											addForm.reset();
										}}
										className="text-muted-foreground hover:text-foreground"
									>
										<XIcon className="size-4" />
									</button>
								</div>
								<p className="text-xs text-muted-foreground mb-4">
									After saving, copy the <span className="font-medium text-foreground">Okta redirect URI</span>{' '}
									from the provider card and add it to your Okta app&apos;s{' '}
									<span className="font-medium text-foreground">Login redirect URIs</span>.
								</p>
								<Form {...addForm}>
									<form onSubmit={addForm.handleSubmit(onAdd)} className="space-y-4">
										<FormField
											control={addForm.control}
											name="domain"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Domain</FormLabel>
													<FormControl>
														<Input placeholder="company.okta.com" autoFocus {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={addForm.control}
											name="clientId"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Client ID</FormLabel>
													<FormControl>
														<Input placeholder="Okta Client ID" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={addForm.control}
											name="clientSecret"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Client Secret</FormLabel>
													<FormControl>
														<Input type="password" placeholder="Okta Client Secret" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={addForm.control}
											name="scope"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Scope</FormLabel>
													<FormControl>
														<Input placeholder="openid email profile" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<div className="flex gap-2 pt-2">
											<Button type="submit" variant="positive" disabled={isPending}>
												{isPending ? 'Adding...' : 'Add Provider'}
											</Button>
											<Button
												type="button"
												variant="outline"
												onClick={() => {
													setIsAdding(false);
													addForm.reset();
												}}
											>
												Cancel
											</Button>
										</div>
									</form>
								</Form>
							</div>
						)}
					</section>
				</div>
			</OrgPageLayout>
		</>
	);
}
