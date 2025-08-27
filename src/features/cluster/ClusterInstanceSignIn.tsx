import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClient } from '@/config/useInstanceClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useInstanceLoginMutation } from '@/features/instance/operations/mutations/useInstanceLoginMutation';
import { getInstanceUserInfo } from '@/features/instance/operations/queries/getInstanceUserInfo';
import { authStore } from '@/lib/authStore';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Navigate, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const SignInSchema = z.object({
	username: z
		.string({
			message: 'Please enter your username.',
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

export function ClusterInstanceSignIn() {
	const { clusterId, instanceId }: { instanceId?: string; clusterId: string; } = route.useParams();
	const { data: cluster } = useQuery(
		getClusterInfoQueryOptions(clusterId, true),
	);
	const instance = useMemo(
		() => instanceId && cluster && cluster?.instances?.find(i => i.id === instanceId),
		[cluster, instanceId]);
	const noun = (instanceId || isLocalStudio) ? 'Instance' : 'Cluster';

	const navigate = useNavigate();
	const operationsUrl = useMemo(() => {
		if (cluster) {
			if (instance) {
				return getOperationsUrlForInstance(instance);
			} else {
				return getOperationsUrlForCluster(cluster);
			}
		}
		return null;
	}, [cluster, instance]);
	const instanceClient = useInstanceClient(operationsUrl);
	const { redirect } = useSearch({ strict: false });
	const router = useRouter();

	const form = useForm<z.infer<typeof SignInSchema>>({
		resolver: zodResolver(SignInSchema),
		defaultValues: {
			username: '',
			password: '',
		},
	});

	const { mutate: submitInstanceLogin, isPending } = useInstanceLoginMutation();

	const submitForm = useCallback(async (formData: z.infer<typeof SignInSchema>) => {
		if (!operationsUrl) {
			toast.error(`${noun} is not yet fully loaded, please wait a moment before trying to sign in.`);
			return;
		}
		submitInstanceLogin({ ...formData, instanceClient }, {
			onSuccess: async (response) => {
				toast.success(response.message);
				const user = await getInstanceUserInfo({ instanceClient });
				// If we sign in to the cluster, we've authenticated against all of its instances too.
				if (cluster?.instances?.length && !instance) {
					for (const clusterInstance of cluster.instances) {
						authStore.setUserForEntity(clusterInstance, user);
					}
				}
				authStore.setUserForEntity(instance || cluster || null, user);
				router.invalidate();
				await navigate({ to: redirect?.startsWith('/') ? redirect : '../browse' });
			},
		});
	}, [cluster, instance, instanceClient, navigate, noun, operationsUrl, redirect, router, submitInstanceLogin]);

	if (cluster?.resetPassword) {
		return <Navigate to="../set-password" replace={true} />;
	}

	return (
		<>
			<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-grey-700 flex items-center">
				<Breadcrumbs />
			</nav>
			<div className="h-screen items-center justify-center flex">
				<div className="text-white w-xs">
					<h2 className="text-2xl font-light">
						Sign in to Harper {noun}</h2>
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
