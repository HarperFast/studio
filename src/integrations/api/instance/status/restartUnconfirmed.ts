import { describeUnansweredWrites, OUTCOME_UNKNOWN_TITLE } from '@/integrations/api/unansweredWrite';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
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

export interface RollingOutcome {
	total: number;
	confirmed: number;
	failed: number;
	unanswered: number;
	/** Set when a member never came back and the loop stopped there: the members after it, left alone. */
	untouched?: number;
}

/**
 * The final toast of a loop that restarts one member at a time, when some member's outcome is not
 * known; undefined when every outcome is.
 */
export function describeUncertainRollingOutcome(
	{ total, confirmed, failed, unanswered, untouched }: RollingOutcome,
	verb: 'restarted' | 'updated',
): { title: string; description: string } | undefined {
	if (!unanswered && untouched === undefined) {
		return undefined;
	}
	const confirmedOf = `${pluralize(confirmed, '"RUNNING" instance was', '"RUNNING" instances were')} confirmed ${verb} `
		+ `of ${pluralize(total, 'instance', 'instances')}.`;
	return {
		title: unanswered ? OUTCOME_UNKNOWN_TITLE : RESTART_UNCONFIRMED_TITLE,
		description: [
			`Only ${confirmedOf}`,
			failed > 0
			&& `${pluralize(failed, 'instance', 'instances')} failed to ${verb === 'restarted' ? 'restart' : 'update'}.`,
			unanswered > 0 && describeUnansweredWrites(unanswered),
			untouched !== undefined && describeNoReturn(untouched, verb),
		].filter(excludeFalsy).join(' '),
	};
}

function describeNoReturn(untouched: number, verb: 'restarted' | 'updated'): string {
	const leftAlone = pluralize(untouched, 'other instance was', 'other instances were');
	return "1 instance accepted the restart but hasn't answered since, so it may still be starting. "
		+ (untouched > 0 ? `${leftAlone} not ${verb}, to keep the cluster available. ` : '')
		+ 'Check its status before you restart it again.';
}
