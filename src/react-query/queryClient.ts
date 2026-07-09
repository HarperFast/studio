import { errorText } from '@/lib/errorText';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { toast } from 'sonner';

export function errorHandler(rawErr: unknown) {
	let errorTitle = 'Error';
	let errorMsg = 'We had some trouble!';
	console.error(rawErr);
	const axiosWrappedErr = rawErr as AxiosError<string | { error?: unknown; message?: unknown }>;
	const otherErr = rawErr as { message?: unknown };
	if (typeof rawErr === 'string') {
		errorMsg = rawErr;
	} else if (axiosWrappedErr?.response?.data) {
		if (typeof axiosWrappedErr.response.data === 'string') {
			errorMsg = axiosWrappedErr.response.data;
		} else {
			// `error`/`message` can be a structured object (e.g. Harper's deploy failures) —
			// extract its nested message (or JSON) rather than showing "[object Object]" (#1426).
			errorMsg = errorText(axiosWrappedErr.response.data.error)
				?? errorText(axiosWrappedErr.response.data.message)
				?? errorMsg;
		}
	} else {
		errorMsg = errorText(otherErr?.message) ?? errorMsg;
	}
	// The JSON fallback from errorText produces messages full of colons that are not
	// "Title: detail" shaped — don't split those.
	if (errorMsg.includes(':') && !errorMsg.startsWith('{') && !errorMsg.startsWith('[')) {
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
