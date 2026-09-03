import { apiClient } from '@/config/apiClient';
import { SchemaUser } from '@/integrations/api/api.gen';
import { useMutation } from '@tanstack/react-query';

export interface SignUpCredentials extends Omit<SchemaUser, 'id'> {
	email: string;
	password: string;
	firstname: string;
	lastname: string;
	captchaToken?: string;
}

export async function onSignUpSubmit({ captchaToken, ...signUpCredentials }: SignUpCredentials) {
	// TODO: The types in our OpenAPI for this endpoint aren't defined.
	const { data } = await apiClient.post('/User/', {
		...signUpCredentials,
		...(captchaToken ? { captchaToken } : {}),
	});
	if (data) {
		return data;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useSignUpMutation() {
	return useMutation<SchemaUser, Error, SignUpCredentials>({
		mutationFn: (loginData) => onSignUpSubmit(loginData),
		// The sign-up form renders the failure inline, beside the inputs, instead of in a toast
		// that fades away from them, so suppress the default global error toast for this
		// mutation (see `SignUp`'s `onError`).
		meta: { skipGlobalErrorToast: true },
		// At mutation level, not in the caller's `mutate` callback: React Query skips those when
		// the component unmounts mid-flight, and this is the only thing reporting the rejection
		// now that `skipGlobalErrorToast` keeps `errorHandler` out of the path.
		onError: (error) => console.error(error),
	});
}
