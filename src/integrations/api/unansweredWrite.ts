import { isReadRequest } from '@/integrations/api/isReadOperation';
import { pluralize } from '@/lib/pluralize';
import { AxiosError, isAxiosError } from 'axios';

export const OUTCOME_UNKNOWN_TITLE = 'Outcome unknown';

// "Couldn't confirm", not "didn't answer": a 503 is an answer, just not a verdict.
export const UNANSWERED_WRITE_MESSAGE = "The server couldn't confirm whether that went through. "
	+ 'Check whether it took effect before you try again, or it may happen twice.';

/** For a flow that sends one write per target and reports a tally: the sentence for the ones with no verdict. */
export function describeUnansweredWrites(count: number): string {
	const they = count === 1 ? 'it' : 'they';
	return `${pluralize(count, 'request', 'requests')} couldn't be confirmed, so ${they} may have gone through. `
		+ `Check before you try again, or ${they} may run twice.`;
}

// Axios reports a request that got no response as ERR_NETWORK, a CORS rejection and a connection
// dropped after the request went out alike, so none of them says the server was never reached.
// ECONNABORTED/ETIMEDOUT are the timeout pair; which one axios uses depends on
// `transitional.clarifyTimeoutError`.
export const NO_RESPONSE_CODES: ReadonlySet<string> = new Set([
	AxiosError.ERR_NETWORK,
	AxiosError.ETIMEDOUT,
	AxiosError.ECONNABORTED,
]);

// A proxy answers these for an upstream that may already have the request (central manager's
// operations proxy sends 504 after forwarding it), and Harper answers 503 when the worker it handed an
// operation to exits or overruns. The same reasoning stops the gateway retry from replaying a write.
const NO_VERDICT_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

/**
 * A request that may have been applied although it failed: not a read, and answered by a 502/503/504
 * or not at all. Its failure must not read as a plain failure, since a retry can apply it twice.
 */
export function isUnansweredWrite(rawErr: unknown): rawErr is AxiosError {
	if (!isAxiosError(rawErr) || !rawErr.config || isReadRequest(rawErr.config)) {
		return false;
	}
	const status = rawErr.response?.status;
	if (typeof status === 'number') {
		return NO_VERDICT_STATUSES.has(status);
	}
	return typeof rawErr.code === 'string' && NO_RESPONSE_CODES.has(rawErr.code);
}
