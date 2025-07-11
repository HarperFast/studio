import { getRouteApi, Navigate, useNavigate } from '@tanstack/react-router';
import { useInstanceLoginMutation } from '@/features/auth/hooks/useInstanceLoginMutation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { getUserInfo } from '@/features/instance/operations/queries/getUserInfo';
import { authStore } from '@/lib/authStore';
import { toast } from 'sonner';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useCallback, useEffect, useMemo } from 'react';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';

const ClusterSignInSchema = z.object({
	username: z
		.string({
			message: 'Please enter the cluster username.',
		})
		.max(75, { message: 'Username must be less than 75 characters' }),
	password: z
		.string({
			message: 'Please enter your password',
		})
		.min(1, { message: 'Password is required' })
		.max(50, { message: 'Password must be less than 50 characters' }),
});

const route = getRouteApi('');

export function ClusterSignIn() {
	const { clusterId } = route.useParams();
	const { data: cluster } = useQuery(
		getClusterInfoQueryOptions(clusterId, true),
	);

	const navigate = useNavigate();
	const operationsUrl = useMemo(() => getOperationsUrlForCluster(cluster), [cluster]);
	// const { redirect } = useSearch({ strict: false });
	// const router = useRouter();
	// const queryClient = useQueryClient();

	const form = useForm<z.infer<typeof ClusterSignInSchema>>({
		resolver: zodResolver(ClusterSignInSchema),
		defaultValues: {
			username: '',
			password: '',
		},
	});
	useEffect(() => {
		const currentValues = form.getValues();
		const tempPassword = cluster?.instances?.find(i => i.tempPassword)?.tempPassword;
		if (!currentValues.username && !currentValues.password && cluster?.resetPassword && tempPassword) {
			form.setValue('username', 'HDB_ADMIN');
			form.setValue('password', tempPassword);
		}
	}, [form, cluster]);

	const { mutate: submitInstanceLogin, isPending } = useInstanceLoginMutation();

	const submitForm = useCallback(async (formData: z.infer<typeof ClusterSignInSchema>) => {
		if (!operationsUrl) {
			toast.error('Cluster is not yet fully loaded, please wait a moment before trying to sign in.');
			return;
		}
		submitInstanceLogin({ ...formData, operationsUrl }, {
			onSuccess: async (response) => {
				toast.success(response.message);
				const user = await getUserInfo({ operationsUrl });
				authStore.setUserForEntity(cluster, user);
				// TODO: What should we invalidate for the cluster?
				//  await queryClient.invalidateQueries({ queryKey: [queryKeys.user], refetchType: 'none' });
				//  router.invalidate();
				// TODO: Support redirecting within the cluster
				//  await navigate({ to: redirect?.startsWith('/') ? redirect : '/browse' });
				await navigate({ to: '../browse' });
			},
		});
	}, [cluster, navigate, operationsUrl, submitInstanceLogin]);

	if (cluster?.resetPassword) {
		return <Navigate to="../set-password" />;
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
					<h2 className="text-2xl font-light">
						Sign in to Harper Cluster</h2>
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
												placeholder="harpersys"
												className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
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
												placeholder="password"
												className="bg-purple-400 border-purple-400 dark:bg-black dark:border-black"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button disabled={isPending} type="submit" variant="submit" className="w-full my-2 rounded-full">
								Sign In
							</Button>
						</form>
					</Form>
				</div>
			</div>
		</>
	);
}
