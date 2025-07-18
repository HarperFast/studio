import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AxiosError } from 'axios';

export function errorHandler(rawErr: unknown) {
	let errorTitle = 'Error';
	let errorMsg = 'We had some trouble!';
	console.error(rawErr);
	const axiosWrappedErr = rawErr as AxiosError<string | { error?: string; message?: string; }>;
	const otherErr = rawErr as { message?: string; };
	if (typeof rawErr === 'string') {
		errorMsg = rawErr;
	} else if (axiosWrappedErr?.response?.data) {
		if (typeof axiosWrappedErr.response.data === 'string') {
			errorMsg = axiosWrappedErr.response.data;
		} else if (axiosWrappedErr.response.data.error) {
			errorMsg = axiosWrappedErr.response.data.error;
		} else if (axiosWrappedErr.response.data.message) {
			errorMsg = axiosWrappedErr.response.data.message;
		}
	} else if (otherErr?.message) {
		errorMsg = otherErr.message;
	}
	if (errorMsg.includes(':')) {
		const split = errorMsg.split(':');
		errorTitle = split.shift()!;
		errorMsg = split.join(':');
	}
	toast.error(errorTitle, {
		description: errorMsg,
		action: {
			label: 'Dismiss',
			onClick: () => toast.dismiss(),
		},
	});
}

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: errorHandler,
	}),
	mutationCache: new MutationCache({
		onError: errorHandler,
	}),
});
