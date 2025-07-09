import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AxiosError } from 'axios';

function errorHandler(rawErr: unknown) {
	let errorMsg = 'We had some trouble!';
	const axiosErr = rawErr as AxiosError<{ error?: string; message?: string; }>;
	const otherErr = rawErr as { message?: string; };
	if (axiosErr?.response?.data) {
		if (axiosErr.response.data.error) {
			errorMsg = axiosErr.response.data.error;
		} else if (axiosErr.response.data.message) {
			errorMsg = axiosErr.response.data.message;
		}
	} else if (otherErr?.message) {
		errorMsg = otherErr.message;
	}
	toast.error(`Error`, {
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
