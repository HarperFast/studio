import { HostnamePreview } from '@/components/HostnamePreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { currentUserQueryKey } from '@/features/auth/queries/getCurrentUser';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { useCreateNewOrganizationMutation } from '@/features/organizations/hooks/useCreateNewOrganization';
import { NewOrganizationSchema, specifiedSubdomain } from '@/features/organizations/mutations/newOrganizationSchema';
import { useCloudAuth } from '@/hooks/useAuth';
import { collapseKebabsToMaxLength } from '@/lib/string/collapseKebabsToMaxLength';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Building2, ExternalLink, Globe2 } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

export function NewOrgForm() {
	const { user } = useCloudAuth();
	const navigate = useNavigate();

	const form = useForm({
		resolver: zodResolver(NewOrganizationSchema),
		defaultValues: {
			name: '',
			subdomain: '',
		},
	});
	const { setFocus, watch } = form;

	useEffect(() => {
		setFocus('name');
	}, [setFocus]);

	const defaultName = `${user?.firstname} ${user?.lastname} Org`;
	const name = watch('name') || defaultName;
	const subdomain = watch('subdomain');
	const calculatedNames = useMemo(() => {
		const suggestedSubdomain = collapseKebabsToMaxLength(
			toKebabCase(name),
			specifiedSubdomain.maxLength!,
		);
		return {
			suggestedSubdomain,
			fullHostName: `future-cluster-names.${subdomain || suggestedSubdomain}.harperfabric.com`,
		};
	}, [name, subdomain]);

	const { mutate: submitNewOrganizationData, isPending } = useCreateNewOrganizationMutation();
	const queryClient = useQueryClient();

	const submitForm = useCallback(async (formData: z.infer<typeof NewOrganizationSchema>) => {
		submitNewOrganizationData({
			name: formData.name || defaultName,
			subdomain: formData.subdomain || calculatedNames.suggestedSubdomain,
		}, {
			onSuccess: (newOrg) => {
				queryClient.invalidateQueries({ queryKey: currentUserQueryKey, refetchType: 'active' });
				authStore.reloadUser(OverallAppSignIn);
				void navigate({ to: `/${newOrg.id}` });
			},
		});
	}, [calculatedNames.suggestedSubdomain, queryClient, submitNewOrganizationData, defaultName, navigate]);

	return (
		<>
			<Form {...form}>
				<form
					id="org-add-form"
					name="org-add-form"
					onSubmit={form.handleSubmit(submitForm)}
					className="grid items-start gap-6 text-foreground lg:grid-cols-[1.2fr_1fr]"
				>
					<Card className="min-w-0 gap-0 overflow-hidden py-0">
						<CardHeader className="border-b border-primary/10 bg-linear-to-br from-primary/5 to-primary/20 py-5 dark:from-primary/20 dark:to-primary/5">
							<div className="flex items-center gap-2 text-primary dark:text-violet-300">
								<Building2 className="size-4" aria-hidden="true" />
								<h2 className="text-base font-semibold text-foreground">Organization details</h2>
							</div>
							<p className="text-sm text-muted-foreground">
								Choose a name and an address for your organization.
							</p>
						</CardHeader>
						<CardContent className="grid gap-6 py-6">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Name</FormLabel>
										<FormControl>
											<Input
												type="text"
												className="bg-background/60"
												maxLength={NewOrganizationSchema.shape.name.maxLength!}
												autoCapitalize="words"
												placeholder={defaultName}
												{...field}
											/>
										</FormControl>
										<FormDescription>Use a name your team will recognize.</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="subdomain"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Subdomain</FormLabel>
										<FormControl>
											<Input
												type="text"
												className="bg-background/60"
												maxLength={specifiedSubdomain.maxLength!}
												autoCapitalize="none"
												placeholder={calculatedNames.suggestedSubdomain}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Lowercase letters, numbers, and dashes. Leave blank to use the suggested subdomain.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
						<div className="border-t border-border/60 bg-muted/20 px-6 py-5">
							<Button type="submit" variant="submit" disabled={isPending} className="w-full sm:w-auto">
								{isPending ? 'Creating organization…' : 'Create organization'} <ArrowRight aria-hidden="true" />
							</Button>
						</div>
					</Card>
					<aside
						className="min-w-0 rounded-2xl border border-primary/15 bg-primary/5 p-6"
						aria-labelledby="org-address-heading"
					>
						<div className="mb-4 flex items-center gap-3">
							<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-violet-300">
								<Globe2 className="size-5" aria-hidden="true" />
							</div>
							<h2 id="org-address-heading" className="text-base font-semibold">Your cluster addresses</h2>
						</div>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							Your subdomain is part of the address for Harper-hosted clusters you create in this organization.
						</p>
						<div className="my-5">
							<p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Address preview</p>
							<HostnamePreview hostname={calculatedNames.fullHostName} testId="org-hostname-preview" />
						</div>
						<p className="text-xs leading-relaxed text-muted-foreground">
							The cluster name here is a placeholder. After creating your organization, you’ll name your first cluster!
						</p>
						<div className="mt-5 border-t border-primary/15 pt-5">
							<h3 className="text-sm font-medium">Prefer your own domain?</h3>
							<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
								You can also bind a domain you own to a Harper-hosted cluster after creating it.
							</p>
							<a
								href="https://docs.harperdb.io/fabric/custom-domains"
								target="_blank"
								rel="noopener noreferrer"
								className="mt-3 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring dark:text-violet-300"
							>
								Learn about custom domains
								<ExternalLink className="size-3.5" aria-hidden="true" />
								<span className="sr-only">(opens in a new tab)</span>
							</a>
						</div>
					</aside>
				</form>
			</Form>
		</>
	);
}
