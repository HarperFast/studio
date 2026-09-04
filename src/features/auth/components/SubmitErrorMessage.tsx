import { ContactUs } from '@/components/ContactUs';
import { SERVER_ERROR_MESSAGE } from '@/features/auth/describeAuthFailure';

// A 4xx body is rendered verbatim, and an edge/WAF block page in front of central-manager arrives
// as one long string. The alert persists where the old toast faded, so bound what can land in a
// `w-xs` column; a real rejection sentence is far shorter than this.
const MAX_RENDERED_LENGTH = 240;
// A high surrogate left at the cut has lost its pair and renders as a replacement character.
const TRAILING_LONE_SURROGATE = /[\uD800-\uDBFF]$/;

// Bounded on purpose: the guard above is a UTF-16 length compare and this only ever touches the
// first MAX_RENDERED_LENGTH units, so a multi-megabyte block page costs one small slice.
function truncate(message: string) {
	const head = message.slice(0, MAX_RENDERED_LENGTH).replace(TRAILING_LONE_SURROGATE, '');
	return `${head.trimEnd()}…`;
}

export function SubmitErrorMessage({ message, suggestSupport }: {
	message: string | undefined;
	suggestSupport?: boolean;
}) {
	if (!message) {
		return null;
	}

	const text = message.length > MAX_RENDERED_LENGTH ? truncate(message) : message;

	// The escalation belongs to the message, not to each caller: every form reaches this with a
	// plain string, and the one message that says retrying may not help is the one that owes a way
	// out. Deciding here is what stops a third form shipping without it.
	const offerSupport = suggestSupport || message === SERVER_ERROR_MESSAGE;

	return (
		<p role="alert" data-slot="form-message" className="text-destructive text-sm break-words">
			{text}
			{offerSupport && (
				<>
					{' '}
					<ContactUs overEmail /> if this keeps happening.
				</>
			)}
		</p>
	);
}
