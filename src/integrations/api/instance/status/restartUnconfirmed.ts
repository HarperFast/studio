import { errorText } from '@/lib/errorText';
import { pluralize } from '@/lib/pluralize';

export const RESTART_UNCONFIRMED_TITLE = 'Not back yet';

export const RESTART_UNCONFIRMED_MESSAGE = "Harper accepted the restart, but it hasn't answered since. "
	+ 'It may still be starting, so check its status before you restart it again.';

/**
 * Harper answered the restart request with success, so the restart ran, but the target never
 * answered again while Studio watched for it. Not a failed restart: sending it again would take the
 * target down a second time.
 */
export class RestartUnconfirmedError extends Error {
	constructor(cause: unknown) {
		// The probe's text stays in the message because Datadog's `shouldKeepEvent` filters on it.
		super(`The restart was accepted, but the target has not answered since: ${errorText(cause) ?? 'no answer'}`, {
			cause,
		});
		this.name = 'RestartUnconfirmedError';
	}
}

/**
 * For a loop that restarts one member at a time and stopped at the member that has not come back:
 * `untouched` members were left alone, since restarting another could take the cluster down.
 */
export function describeUnconfirmedRestart(untouched: number, verb: 'restarted' | 'updated'): string {
	const leftAlone = pluralize(untouched, 'other instance was', 'other instances were');
	return "1 instance accepted the restart but hasn't answered since, so it may still be starting. "
		+ (untouched > 0 ? `${leftAlone} not ${verb}, to keep the cluster available. ` : '')
		+ 'Check its status before you restart it again.';
}
