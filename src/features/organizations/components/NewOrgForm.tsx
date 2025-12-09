import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { currentUserQueryKey } from '@/features/auth/queries/getCurrentUser';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { useCreateNewOrganizationMutation } from '@/features/organizations/hooks/useCreateNewOrganization';
import { NewOrganizationSchema } from '@/features/organizations/mutations/newOrganizationSchema';
import { useCloudAuth } from '@/hooks/useAuth';
import { collapseKebabsToMaxLength } from '@/lib/string/collapseKebabsToMaxLength';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
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
			NewOrganizationSchema.shape.subdomain.maxLength!,
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
			// type: 'SELF_SERVICE',
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
				<form onSubmit={form.handleSubmit(submitForm)} className="grid gap-6 text-white max-w-xl">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="pb-1">Name</FormLabel>
								<FormControl>
									<Input
										type="text"
										maxLength={NewOrganizationSchema.shape.name.maxLength!}
										autoCapitalize="words"
										placeholder={defaultName}
										{...field}
									/>
								</FormControl>
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
										maxLength={NewOrganizationSchema.shape.subdomain.maxLength!}
										autoCapitalize="none"
										placeholder={calculatedNames.suggestedSubdomain}
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormItem>
						<FormLabel className="pb-1">Full Host Name</FormLabel>
						<FormControl>
							<span>{calculatedNames.fullHostName}</span>
						</FormControl>
						<FormMessage />
					</FormItem>

					<DialogFooter>
						<Button type="submit" variant="submit" className="rounded-full" disabled={isPending}>
							Create New Organization <ArrowRight />
						</Button>
					</DialogFooter>
				</form>
			</Form>
		</>
	);
}
