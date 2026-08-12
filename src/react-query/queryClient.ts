import { errorText } from '@/lib/errorText';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { toast } from 'sonner';

/**
 * Turn an error of unknown shape into the heading + body the UI shows for it.
 *
 * Split out of {@link errorHandler} so a form can render the same text inline — beside the
 * inputs, where it persists — instead of only in a toast that fades. One extractor means the
 * two can't drift.
 */
export function describeError(rawErr: unknown): { title: string; description: string } {
	let errorTitle = 'Error';
	let errorMsg = 'We had some trouble!';
	let splitTitleFromMsg = true;
	const axiosWrappedErr = rawErr as AxiosError<
		string | { error?: unknown; message?: unknown; code?: unknown; title?: unknown; detail?: unknown }
	>;
	const otherErr = rawErr as { message?: unknown };
	if (typeof rawErr === 'string') {
		errorMsg = rawErr;
	} else if (axiosWrappedErr?.response?.data) {
		const data = axiosWrappedErr.response.data;
		if (typeof data === 'string') {
			errorMsg = data;
		} else if (typeof data.title === 'string' && data.title) {
			// Harper 5 REST errors are RFC 9457 Problem Details: the "Code: message" string
			// became { code, title, detail? }. Map code → toast title and title (+ detail) →
			// description. The title is a plain sentence that may itself contain colons
			// ("Plan not found: plan-123"), so skip the "Title: detail" split below.
			if (typeof data.code === 'string' && data.code) {
				errorTitle = data.code;
			}
			const detail = errorText(data.detail);
			errorMsg = detail ? `${data.title}: ${detail}` : data.title;
			splitTitleFromMsg = false;
		} else {
			// `error`/`message` can be a structured object (e.g. Harper's deploy failures) —
			// extract its nested message (or JSON) rather than showing "[object Object]" (#1426).
			errorMsg = errorText(data.error) ?? errorText(data.message) ?? errorMsg;
		}
	} else {
		errorMsg = errorText(otherErr?.message) ?? errorMsg;
	}
	// The JSON fallback from errorText produces messages full of colons that are not
	// "Title: detail" shaped — don't split those.
	if (splitTitleFromMsg && errorMsg.includes(':') && !errorMsg.startsWith('{') && !errorMsg.startsWith('[')) {
		const split = errorMsg.split(':');
		errorTitle = split.shift()!;
		errorMsg = split.join(':');
	}
	return { title: errorTitle, description: errorMsg };
}

export function errorHandler(rawErr: unknown) {
	console.error(rawErr);
	const { title: errorTitle, description: errorMsg } = describeError(rawErr);
	const axiosWrappedErr = rawErr as AxiosError;
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

/**
 * Every mutation error routes through the shared toast by default. A mutation can opt out
 * — to render its own inline UI or redirect instead — with `meta: { skipGlobalErrorToast: true }`
 * (e.g. the cloud login flow redirects an unverified user to the email-verification page, and
 * sign-up puts an already-registered email on the field that has to change).
 *
 * Exported so a test can build a throwaway `QueryClient` that routes errors the way the app
 * does without restating the opt-out rule — a copy of it in a test would keep passing after
 * this changed.
 */
export const mutationErrorHandler: NonNullable<MutationCache['config']['onError']> = (
	error,
	_variables,
	_onMutateResult,
	mutation,
) => {
	if (mutation.meta?.skipGlobalErrorToast) {
		return;
	}
	errorHandler(error);
};

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: errorHandler,
	}),
	mutationCache: new MutationCache({ onError: mutationErrorHandler }),
});
