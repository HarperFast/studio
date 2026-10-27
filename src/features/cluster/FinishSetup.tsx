import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { defaultClusterUsername } from '@/config/constants';
import { authStore } from '@/features/auth/store/authStore';
import { getPendingPresetSetup } from '@/features/clusters/presets/pendingPresetSetup';
import { useCloudAuth } from '@/hooks/useAuth';
import { AddUserFormSchema } from '@/integrations/api/instance/auth/addUserFormSchema';
import { useInstanceResetPasswordMutation } from '@/integrations/api/instance/auth/useInstanceResetPasswordMutation';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useRouter, useSearch } from '@tanstack/react-router';
import { ActivityIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { allClusterInstancesRunning } from './allInstancesRunning';
import { getClusterInfoQueryOptions, markClusterPasswordSet } from './queries/getClusterInfoQuery';
import { clusterSignInIds } from './terminatedClusterSignIns';

export function FinishSetup() {
	const { user } = useCloudAuth();
	const { clusterId }: { clusterId: string } = useParams({ strict: false });
	const { data: cluster } = useQuery(
		getClusterInfoQueryOptions(clusterId, true),
	);

	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const operationsUrl = useMemo(() => getOperationsUrlForCluster(cluster), [cluster]);

	const { redirect } = useSearch({ strict: false });
	const router = useRouter();

	const methods = useForm({
		resolver: zodResolver(AddUserFormSchema),
		defaultValues: {
			confirmPassword: '',
			password: '',
			role: 'super_user',
			username: user?.email ?? '',
		},
	});
	const { setFocus, control, handleSubmit } = methods;

	useEffect(() => {
		setFocus('password');
	}, [setFocus]);

	const tempPassword = cluster?.instances?.find(i => i.tempPassword)?.tempPassword;
	const instancesReady = allClusterInstancesRunning(cluster);

	const { mutate: submitInstanceResetPassword, isPending, isSuccess } = useInstanceResetPasswordMutation();

	const submitForm = useCallback(async (formData: z.infer<typeof AddUserFormSchema>) => {
		if (!operationsUrl) {
			toast.error('Cluster is not yet fully loaded, please wait a moment before trying to sign in.');
			return;
		}
		if (!instancesReady) {
			toast.error('Some instances are still starting up. You can create your admin user once they are all running.');
			return;
		}
		submitInstanceResetPassword({
			operationsUrl,
			signInIds: clusterSignInIds(cluster!),
			clusterId,
			newPassword: formData.password,
			tempPassword,
			initialUsername: defaultClusterUsername,
			desiredUsername: formData.username,
		}, {
			onSuccess: async ({ user }) => {
				toast.success(
					user
						? "Admin user created. You're now signed in to your cluster."
						: 'Admin user created. Connect to your cluster to continue.',
				);
				authStore.setUserForEntity(cluster!, user);
				// The mutation already told CM the password changed (resetPasswordUpdater); reflect
				// that in the cached cluster before navigating so ClusterHome's resetPassword guard
				// doesn't bounce us back here off a stale poll.
				await markClusterPasswordSet(queryClient, clusterId);
				void router.invalidate();
				const home = buildAbsoluteLinkToPage({ organizationId: cluster!.organizationId, clusterId });
				await navigate({
					to: redirect?.startsWith('/')
						? redirect
						// A cluster created for a preset goes straight on to installing it, now that someone
						// who can is signed in. Signed out, its home offers the setup once they connect.
						: user && (getPendingPresetSetup(clusterId) || cluster?.preset)
						? `${home}/setup`
						: home,
				});
			},
		});
	}, [
		cluster,
		clusterId,
		instancesReady,
		navigate,
		operationsUrl,
		queryClient,
		redirect,
		router,
		submitInstanceResetPassword,
		tempPassword,
	]);

	const clusterIds = { organizationId: cluster?.organizationId, clusterId };
	// Setup clears resetPassword itself, in central manager while it runs and in the cache before the page's own
	// navigation away has loaded; redirecting then cuts it short on the sign-in page, which drops a Fabric Connect fallback.
	if (cluster && !cluster.resetPassword && !isPending && !isSuccess) {
		return <Navigate to={buildAbsoluteLinkToPage(clusterIds, 'sign-in')} replace={true} />;
	}

	// On an initial deploy, hold the admin user creation until every instance is running — creating
	// it while an instance is still cloning would leave that clone with the replaced credentials.
	if (cluster && !instancesReady) {
		return <Navigate to={buildAbsoluteLinkToPage(clusterIds, 'starting-up')} replace={true} />;
	}

	return (
		<>
			<nav
				aria-label="Breadcrumb"
				className="studio-subnav fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-violet-50 border-b border-violet-100 dark:bg-grey-700 dark:border-none flex items-center"
			>
				<Breadcrumbs />
			</nav>
			<div className="items-center justify-center flex mt-32 py-4 min-h-[calc(100vh-(--spacing(32))-var(--notification-banner-height))]">
				<div className="text-foreground w-xs">
					<h1 className="text-2xl font-light">Create Admin User</h1>
					<p className="text-muted-foreground">
						You are ready to create your first user in your new cluster. These credentials belong to you alone, and you
						can create more users and roles once you create this first one.
					</p>
					<Form {...methods}>
						<form
							id="cluster-create-admin-form"
							name="cluster-create-admin-form"
							onSubmit={handleSubmit(submitForm)}
							className="my-4"
						>
							<FormField
								control={control}
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
								control={control}
								name="password"
								render={({ field }) => (
									<FormItem className="my-4">
										<FormLabel>Password</FormLabel>
										<FormControl>
											<Input
												type="password"
												autoComplete="new-password"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={control}
								name="confirmPassword"
								render={({ field }) => (
									<FormItem className="my-4">
										<FormLabel>Confirm Password</FormLabel>
										<FormControl>
											<Input
												type="password"
												autoComplete="new-password"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<Button disabled={isPending || isSuccess} type="submit" variant="submit" className="w-full my-2">
								Create Admin User
							</Button>
						</form>
					</Form>

					<p className="text-muted-foreground flex gap-2 align-middle">
						<ActivityIcon size={36} className="flex-none" />
						<span>
							These credentials will be used to sign into your cluster directly, providing you a secure connection from
							your browser to your cluster.
						</span>
					</p>
				</div>
			</div>
		</>
	);
}
