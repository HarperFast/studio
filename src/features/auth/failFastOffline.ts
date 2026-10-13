import { errorHandler } from '@/react-query/queryClient';
import { onlineManager } from '@tanstack/react-query';
import { AxiosError, isAxiosError } from 'axios';
import { toast } from 'sonner';

export const OFFLINE_TITLE = "You're offline";
export const OFFLINE_MESSAGE = "You're offline, so we can't reach the server. Check your connection, then try again.";
const OFFLINE_TOAST_DESCRIPTION = "We can't reach the server. Check your connection, then try again.";
const OFFLINE_TOAST_ID = 'auth-offline';

// The browser's offline flag describes its network, and local Studio's loopback instance answers without one.
const LOOPBACK_HOST = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$|\.localhost$/i;

/**
 * An `ERR_NETWORK` from a request sent while the browser reported offline. Any other `ERR_NETWORK` gets
 * the outcome-unknown copy instead (`describeRetryableAuthFailure`), because a connection that dropped
 * after the request went out reads the same way.
 */
export class OfflineSubmitError extends Error {
	constructor(cause: unknown) {
		super('Auth request failed while the browser reported no connection', { cause });
		this.name = 'OfflineSubmitError';
	}
}

/**
 * `networkMode` and `mutationFn` for an auth form's mutation. React Query's default `'online'` pauses
 * the mutation while offline instead of failing it: the form spins, and the request goes out whenever
 * the connection returns, on a CAPTCHA token that may have expired by then (#1930).
 */
export function failFastOffline<TVariables, TData>(send: (variables: TVariables) => Promise<TData>) {
	return {
		networkMode: 'always' as const,
		mutationFn: async (variables: TVariables): Promise<TData> => {
			const offlineAtSend = !onlineManager.isOnline();
			try {
				return await send(variables);
			} catch (error) {
				throw offlineAtSend && isOfflineFailure(error) ? new OfflineSubmitError(error) : error;
			}
		},
	};
}

// Only `ERR_NETWORK`: an offline browser fails the request at once, so a timeout means it was out there.
function isOfflineFailure(error: unknown): boolean {
	return isAxiosError(error) && !error.response && error.code === AxiosError.ERR_NETWORK && !targetsLoopback(error);
}

function targetsLoopback({ config }: AxiosError): boolean {
	if (!config) {
		return false;
	}
	try {
		// Local Studio's build sets `baseURL` to a relative `/` (`.github/deploy-public-env/.env.localstudio`),
		// and `new URL` throws on a relative base.
		const base = new URL(config.baseURL ?? '', window.location.href).href;
		return LOOPBACK_HOST.test(new URL(config.url ?? '', base).hostname);
	} catch {
		return false;
	}
}

/**
 * Mutation-level reporting for an auth form that shows its own failure. `console.debug` for an offline
 * one: RUM collects `console.error`, and being offline is not a Studio failure (#1669).
 */
export function reportAuthFailure(error: unknown) {
	if (error instanceof OfflineSubmitError) {
		console.debug('Auth request failed offline', error);
		return;
	}
	console.error(error);
}

function toastAuthFailure(error: unknown) {
	if (!(error instanceof OfflineSubmitError)) {
		errorHandler(error);
		return;
	}
	console.debug('Auth request failed offline', error);
	toast.error(OFFLINE_TITLE, {
		id: OFFLINE_TOAST_ID,
		description: OFFLINE_TOAST_DESCRIPTION,
		action: {
			label: 'Dismiss',
			onClick: () => toast.dismiss(OFFLINE_TOAST_ID),
		},
	});
}

/**
 * For an auth mutation whose failures show in the global toast, spread after `failFastOffline`. An
 * offline failure gets its own toast and stays out of RUM; every other one still goes to `errorHandler`.
 */
export const toastsAuthFailures = {
	meta: { skipGlobalErrorToast: true },
	onError: toastAuthFailure,
};
