import { defaultInstanceRoute, defaultInstanceRouteUpOne, isLocalStudio } from '@/config/constants';
import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { useInstanceLoginMutation } from '@/features/instance/operations/mutations/useInstanceLoginMutation';
import { UsernameSignInSchema } from '@/features/instance/operations/schemas/signInSchema';
import { SchemaHdbInstance } from '@/lib/api.gen';
import { Cluster } from '@/lib/api.patch';
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

export function useClusterInstanceSignIn({
	cluster,
	instance,
	instanceParams,
}: {
	cluster: Cluster | undefined,
	instance: SchemaHdbInstance | undefined,
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig
}) {
	const navigate = useNavigate();
	const router = useRouter();
	const { redirect } = useSearch({ strict: false });

	const { mutate: submitInstanceLogin, isPending } = useInstanceLoginMutation();

	const submitForm = useCallback(async (formData: z.infer<typeof UsernameSignInSchema>) => {
		submitInstanceLogin(
			{
				...formData,
				...instanceParams,
			},
			{
				onSuccess: async ({ message, user }) => {
					toast.success(message);
					// If we sign in to the cluster, we've authenticated against all of its instances too.
					if (cluster?.instances?.length && !instance) {
						for (const clusterInstance of cluster.instances) {
							authStore.setUserForEntity(clusterInstance, user);
						}
					}
					const entity = isLocalStudio ? OverallAppSignIn : instance || cluster;
					if (!entity) {
						throw new Error('Sign in failed due to missing cluster or instance.');
					}
					authStore.setUserForEntity(entity, user);
					void router.invalidate();
					await navigate({
						to: redirect?.startsWith('/')
							? redirect
							: isLocalStudio
								? defaultInstanceRoute
								: defaultInstanceRouteUpOne,
					});
				},
			});
	}, [cluster, instance, instanceParams, navigate, redirect, router, submitInstanceLogin]);

	return {
		isPending,
		submitForm,
	};
}
