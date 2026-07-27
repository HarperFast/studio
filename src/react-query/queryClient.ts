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
	// Same collapse for 403s. `pollUnlessForbidden` stops polls that 403, but other
	// repeat sources remain (route preloads and background queries firing while
	// signed out, #1546), and a permission failure repeated N times is still one
	// thing for the user to know.
	const isForbidden = axiosWrappedErr?.response?.status === 403;
	toast.error(errorTitle, {
		id: isTimeout ? 'request-timeout' : isForbidden ? 'request-forbidden' : undefined,
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
		// Every mutation error routes through the shared toast by default. A mutation can opt out
		// — to render its own inline UI or redirect instead — with `meta: { skipGlobalErrorToast: true }`
		// (e.g. the cloud login flow redirects an unverified user to the email-verification page).
		onError: (error, _variables, _context, mutation) => {
			if (mutation.meta?.skipGlobalErrorToast) {
				return;
			}
			errorHandler(error);
		},
	}),
});
