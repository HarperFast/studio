import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { defaultClusterUsername } from '@/config/constants';
import { useInstanceClient } from '@/config/useInstanceClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import {
	useInstanceResetPasswordMutation,
} from '@/features/instance/operations/mutations/useInstanceResetPasswordMutation';
import { getInstanceUserInfo } from '@/features/instance/operations/queries/getInstanceUserInfo';
import { authStore } from '@/lib/authStore';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Navigate, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const ClusterSetPasswordSchema = z
	.object({
		username: z.string({
			message: 'Please enter a username.',
			// TODO: usernames must have only letters, numbers, hyphens, and underscores
		}).min(1, { message: 'Please enter a username.' }),
		password: z
			.string({
				message: 'Please enter your password',
			})
			.min(1, { message: 'Password is required' })
			.max(50, { message: 'Password must be less than 50 characters' }),
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword'],
	});

const route = getRouteApi('');

export function ClusterSetPassword() {
	const { clusterId }: { clusterId: string; } = route.useParams();
	const { data: cluster } = useQuery(
		getClusterInfoQueryOptions(clusterId, true),
	);

	const navigate = useNavigate();
	const operationsUrl = useMemo(() => getOperationsUrlForCluster(cluster), [cluster]);
	const instanceClient = useInstanceClient(operationsUrl);

	const { redirect } = useSearch({ strict: false });
	const router = useRouter();

	const form = useForm<z.infer<typeof ClusterSetPasswordSchema>>({
		resolver: zodResolver(ClusterSetPasswordSchema),
		defaultValues: {
			username: '',
			password: '',
			confirmPassword: '',
		},
	});
	const tempPassword = cluster?.instances?.find(i => i.tempPassword)?.tempPassword;

	const { mutate: submitInstanceResetPassword, isPending } = useInstanceResetPasswordMutation();

	const submitForm = useCallback(async (formData: z.infer<typeof ClusterSetPasswordSchema>) => {
		if (!operationsUrl) {
			toast.error('Cluster is not yet fully loaded, please wait a moment before trying to sign in.');
			return;
		}
		submitInstanceResetPassword({
			instanceClient,
			clusterId,
			newPassword: formData.password,
			tempPassword,
			initialUsername: defaultClusterUsername,
			desiredUsername: formData.username,
		}, {
			onSuccess: async (response) => {
				toast.success(response.message);
				const user = await getInstanceUserInfo({ instanceClient });
				authStore.setUserForEntity(cluster || null, user);
				router.invalidate();
				await navigate({ to: redirect?.startsWith('/') ? redirect : '../browse' });
			},
		});
	}, [cluster, clusterId, instanceClient, navigate, operationsUrl, redirect, router, submitInstanceResetPassword, tempPassword]);

	if (cluster && !cluster.resetPassword) {
		return <Navigate to="../sign-in" />;
	}

	// TODO: There's a lot we can DRY up between the sign in form variants.
	return (
		<>
			<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-grey-700">
				<div className="flex items-center justify-between h-full text-sm text-white">
					<div className="w-full text-white">
						{cluster?.name ? <h2 className="text-xl font-semibold">{cluster.name}</h2> :
							<TextLoadingSkeleton />}
						<p className="text-xs md:text-sm">Cluster ID: {clusterId}</p>
					</div>
				</div>
			</nav>
			<div className="h-screen items-center justify-center flex">
				<div className="text-white w-xs">
					<h2 className="text-2xl font-light">Set Harper Cluster Password</h2>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(submitForm)} className="my-4">
							<FormField
								control={form.control}
								name="username"
								render={({ field }) => (
									<FormItem className="my-4">
										<FormLabel>Username</FormLabel>
										<FormControl>
											<Input
												autoComplete="username"
												type="text"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="password"
								render={({ field }) => (
									<FormItem className="my-4">
										<FormLabel>Password</FormLabel>
										<FormControl>
											<Input
												type="password"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="confirmPassword"
								render={({ field }) => (
									<FormItem className="my-4">
										<FormLabel>Confirm Password</FormLabel>
										<FormControl>
											<Input
												type="password"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button disabled={isPending} type="submit" variant="submit" className="w-full my-2 rounded-full">
								Set Cluster Admin Password
							</Button>
						</form>
					</Form>
				</div>
			</div>
		</>
	);
}
