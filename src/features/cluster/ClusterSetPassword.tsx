import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { defaultClusterUsername, defaultInstanceRouteUpOne } from '@/config/constants';
import { useInstanceClient } from '@/config/useInstanceClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import {
	useInstanceResetPasswordMutation,
} from '@/features/instance/operations/mutations/useInstanceResetPasswordMutation';
import { getInstanceUserInfo } from '@/features/instance/operations/queries/getInstanceUserInfo';
import { AddUserFormSchema } from '@/features/instance/operations/schemas/addUserFormSchema';
import { authStore } from '@/lib/authStore';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useRouter, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export function ClusterSetPassword() {
	const { clusterId }: { clusterId: string; } = useParams({ strict: false });
	const { data: cluster } = useQuery(
		getClusterInfoQueryOptions(clusterId, true),
	);

	const navigate = useNavigate();
	const operationsUrl = useMemo(() => getOperationsUrlForCluster(cluster), [cluster]);
	const instanceClient = useInstanceClient(operationsUrl);

	const { redirect } = useSearch({ strict: false });
	const router = useRouter();

	const form = useForm({
		resolver: zodResolver(AddUserFormSchema),
		defaultValues: {
			confirmPassword: '',
			password: '',
			role: 'super_user',
			username: '',
		},
	});
	const tempPassword = cluster?.instances?.find(i => i.tempPassword)?.tempPassword;

	const { mutate: submitInstanceResetPassword, isPending } = useInstanceResetPasswordMutation();

	const submitForm = useCallback(async (formData: z.infer<typeof AddUserFormSchema>) => {
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
				void router.invalidate();
				await navigate({ to: redirect?.startsWith('/') ? redirect : defaultInstanceRouteUpOne });
			},
		});
	}, [cluster, clusterId, instanceClient, navigate, operationsUrl, redirect, router, submitInstanceResetPassword, tempPassword]);

	if (cluster && !cluster.resetPassword) {
		return <Navigate to="../sign-in" replace={true} />;
	}

	return (
		<>
			<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-grey-700 flex items-center">
				<Breadcrumbs />
			</nav>
			<div className="h-screen items-center justify-center flex">
				<div className="text-white w-xs">
					<h2 className="text-2xl font-light">Create Admin User</h2>
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
								Create Admin User
							</Button>
						</form>
					</Form>
				</div>
			</div>
		</>
	);
}
