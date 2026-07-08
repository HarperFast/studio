import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { toast } from 'sonner';

export function errorHandler(rawErr: unknown) {
	let errorTitle = 'Error';
	let errorMsg = 'We had some trouble!';
	console.error(rawErr);
	const axiosWrappedErr = rawErr as AxiosError<string | { error?: string; message?: string }>;
	const otherErr = rawErr as { message?: string };
	if (typeof rawErr === 'string') {
		errorMsg = rawErr;
	} else if (axiosWrappedErr?.response?.data) {
		if (typeof axiosWrappedErr.response.data === 'string') {
			errorMsg = axiosWrappedErr.response.data;
		} else if (typeof axiosWrappedErr.response.data.error === 'string' && axiosWrappedErr.response.data.error) {
			errorMsg = axiosWrappedErr.response.data.error;
		} else if (typeof axiosWrappedErr.response.data.message === 'string' && axiosWrappedErr.response.data.message) {
			errorMsg = axiosWrappedErr.response.data.message;
		}
	} else if (typeof otherErr?.message === 'string' && otherErr.message) {
		errorMsg = otherErr.message;
	}
	if (errorMsg.includes(':')) {
		const split = errorMsg.split(':');
		errorTitle = split.shift()!;
		errorMsg = split.join(':');
	}
	// Axios surfaces request timeouts as ECONNABORTED / ETIMEDOUT. Multiple
	// queries can timeout in parallel and stack up identical toasts; collapse
	// them onto a single id so the user sees one instead of a wall.
	const isTimeout = axiosWrappedErr?.code === 'ECONNABORTED' || axiosWrappedErr?.code === 'ETIMEDOUT';
	toast.error(errorTitle, {
		id: isTimeout ? 'request-timeout' : undefined,
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
