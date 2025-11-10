import { apiClient } from '@/config/apiClient';
import { currentUserQueryKey } from '@/features/auth/queries/getCurrentUser';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { EmailSignInSchema } from '@/features/instance/operations/schemas/signInSchema';
import { loginSuccessDatadogAction } from '@/integrations/datadog/datadog';
import { reoClient } from '@/integrations/reo/reo';
import { User } from '@/lib/api.patch';
import { parseCompanyFromEmail } from '@/lib/string/parseCompanyFromEmail';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';

export function useCloudSignIn() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const router = useRouter();
	const { mutate: submitLoginData, isPending } = useLoginMutation();
	const { redirect } = useSearch({ strict: false });

	const submitForm = useCallback((formData: z.infer<typeof EmailSignInSchema>) => {
		submitLoginData(formData, {
			onSuccess: async (data) => {
				// TODO: Detect and fallback to session storage and basic auth if necessary.
				authStore.setUserForEntity(OverallAppSignIn, data);
				const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(data);

				loginSuccessDatadogAction(data);

				const company = parseCompanyFromEmail(data.email);
				reoClient?.identify?.({
					username: data.email,
					type: 'email',
					...(company ? { company } : {}),
				});
				await queryClient.invalidateQueries({ queryKey: currentUserQueryKey, refetchType: 'none' });
				void router.invalidate();
				await navigate({ to: redirect?.startsWith('/') ? redirect : defaultCloudRoute });
			},
		});
	}, [navigate, queryClient, redirect, router, submitLoginData]);
	return {
		isPending,
		submitForm,
	};
}

function useLoginMutation() {
	return useMutation<User, Error, z.infer<typeof EmailSignInSchema>>({
		mutationFn: (loginData) => onLoginSubmit(loginData),
	});
}

async function onLoginSubmit({ email, password }: z.infer<typeof EmailSignInSchema>) {
	// TODO: The OpenAPI request body for this endpoint isn't defined.
	const { data } = await apiClient.post('/Login/', {
		email,
		password,
	});
	if (data) {
		// TODO: The OpenAPI response for this endpoint isn't defined.
		return data as unknown as User;
	} else {
		throw new Error('Something went wrong');
	}
}
