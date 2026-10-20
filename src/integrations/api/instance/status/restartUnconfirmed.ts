import { describeUnansweredWrites, OUTCOME_UNKNOWN_TITLE } from '@/integrations/api/unansweredWrite';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { errorText } from '@/lib/errorText';
import { pluralize } from '@/lib/pluralize';

export const RESTART_UNCONFIRMED_TITLE = 'Not back yet';

export const RESTART_UNCONFIRMED_MESSAGE = "Harper accepted the restart, but Studio couldn't confirm it came back. "
	+ 'It may still be starting, so check its status before you restart it again.';

/**
 * Harper answered the restart request with success, so the restart ran, but Studio never saw the
 * target answer again while it watched. Not a failed restart: sending it again would take the target
 * down a second time.
 */
export class RestartUnconfirmedError extends Error {
	constructor(cause: unknown) {
		// The probe's text stays in the message because Datadog's `shouldKeepEvent` filters on it.
		super(`The restart was accepted, but the target was not confirmed back: ${errorText(cause) ?? 'no answer'}`, {
			cause,
		});
		this.name = 'RestartUnconfirmedError';
	}
}

interface RollingOutcome {
	total: number;
	confirmed: number;
	failed: number;
	unanswered: number;
	/** Set when a member never came back and the loop stopped there: the members after it, left alone. */
	untouched?: number;
	/** The member the loop stopped at got no verdict on its restart, rather than accepting it. */
	stoppedOnNoVerdict?: boolean;
	/** Members a Cancel left alone. */
	canceled?: number;
}

/**
 * The final toast of a loop that restarts one member at a time, when some member's outcome is not
 * known; undefined when every outcome is.
 */
export function describeUncertainRollingOutcome(
	{ total, confirmed, failed, unanswered, untouched, stoppedOnNoVerdict, canceled = 0 }: RollingOutcome,
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
			untouched !== undefined && describeNoReturn(untouched, verb, stoppedOnNoVerdict ? unanswered : 0),
			canceled > 0
			&& `${pluralize(canceled, 'other instance was', 'other instances were')} not ${verb}: Cancel stopped it there.`,
		].filter(excludeFalsy).join(' '),
	};
}

/** `unanswered` is non-zero when the member it stopped at got no verdict, and counts those requests. */
function describeNoReturn(untouched: number, verb: 'restarted' | 'updated', unanswered: number): string {
	const leftAlone = pluralize(untouched, 'other instance was', 'other instances were');
	const notBack = !unanswered
		? "1 instance accepted the restart but couldn't be confirmed back, so it may still be starting. "
		: `Studio couldn't confirm ${unanswered === 1 ? 'it' : 'the last of them'} came back either, so it may still be `
			+ 'starting. ';
	return notBack
		+ (untouched > 0 ? `${leftAlone} not ${verb}, to keep the cluster available. ` : '')
		+ 'Check its status before you restart it again.';
}
