import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { defaultInstanceRoute, defaultInstanceRouteUpOne, isLocalStudio } from '@/config/constants';
import { useInstanceClient } from '@/config/useInstanceClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useInstanceLoginMutation } from '@/features/instance/operations/mutations/useInstanceLoginMutation';
import { getInstanceUserInfo } from '@/features/instance/operations/queries/getInstanceUserInfo';
import { SignInSchema } from '@/features/instance/operations/schemas/signInSchema';
import { authStore, OverallAppSignIn } from '@/lib/authStore';
import { CrossLocalhostIssueType, detectCrossLocalhostUrls } from '@/lib/urls/detectCrossLocalhostUrls';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { queryKeys } from '@/react-query/constants';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useRouter, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export function ClusterInstanceSignIn() {
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { redirect } = useSearch({ strict: false });
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const { data: cluster } = useQuery(
		getClusterInfoQueryOptions(clusterId, true),
	);
	const instance = useMemo(
		() => instanceId && cluster && cluster?.instances?.find(i => i.id === instanceId),
		[cluster, instanceId]);
	const noun = isLocalStudio ? 'Local' : instanceId ? 'Instance' : 'Cluster';

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
	const warnAboutLoginCookieIssues = useMemo(
		() => detectCrossLocalhostUrls(navigator.userAgent, location.hostname, operationsUrl),
		[operationsUrl],
	);

	const form = useForm({
		resolver: zodResolver(SignInSchema),
		defaultValues: {
			username: '',
			password: '',
		},
	});

	const { mutate: submitInstanceLogin, isPending } = useInstanceLoginMutation();

	const submitForm = useCallback(async (formData: z.infer<typeof SignInSchema>) => {
		submitInstanceLogin(
			{
				...formData,
				instanceClient,
			},
			{
				onSuccess: async (response) => {
					toast.success(response.message);
					const user = await getInstanceUserInfo({ instanceClient });
					// If we sign in to the cluster, we've authenticated against all of its instances too.
					if (cluster?.instances?.length && !instance) {
						for (const clusterInstance of cluster.instances) {
							authStore.setUserForEntity(clusterInstance, user);
						}
					}
					authStore.setUserForEntity(instance || cluster || OverallAppSignIn, user);
					void queryClient.invalidateQueries({ queryKey: [queryKeys.user], refetchType: 'none' });
					router.invalidate();
					await navigate({
						to: redirect?.startsWith('/')
							? redirect
							: isLocalStudio
								? defaultInstanceRoute
								: defaultInstanceRouteUpOne,
					});
				},
			});
	}, [cluster, instance, instanceClient, navigate, queryClient, redirect, router, submitInstanceLogin]);

	if (cluster && !cluster?.fqdn) {
		return <Navigate to="../instances" replace={true} />;
	}

	if (cluster?.resetPassword) {
		return <Navigate to="../set-password" replace={true} />;
	}

	return (
		<>
			{!isLocalStudio && (
				<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-grey-700 flex items-center">
					<Breadcrumbs />
				</nav>)}
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
							{warnAboutLoginCookieIssues === CrossLocalhostIssueType.MixedLoopback && (
								<div className="p-4 mt-4 text-sm text-yellow-800 rounded-lg bg-yellow-50 dark:bg-gray-800 dark:text-yellow-300" role="alert">
									<span className="font-medium">Warning!</span> Your login might not work because
									you're mixing 127.0.0.1 and localhost. Pick one or the other.
								</div>
							)}
							{warnAboutLoginCookieIssues === CrossLocalhostIssueType.InsecureCookieOutsideChromeAndFirefox && (
								<div className="p-4 mt-4 text-sm text-yellow-800 rounded-lg bg-yellow-50 dark:bg-gray-800 dark:text-yellow-300" role="alert">
									<span className="font-medium">Warning!</span> Your login might not work because your
									browser doesn't consider localhost to be secure, so it doesn't pass the cookies
									along. Firefox or Chromium based browsers should pass the cookies properly.
								</div>
							)}
						</form>
					</Form>
				</div>
			</div>
		</>
	);
}
