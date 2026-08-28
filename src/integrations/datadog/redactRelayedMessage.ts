/**
 * Replace the message of an error Harper relayed to the browser, before it leaves for Datadog.
 *
 * `SSEOperationError` carries whatever text the server composed for a streamed operation
 * (`src/integrations/api/sse/streamOperation.ts`), and that text quotes the input the customer
 * supplied: a package reference, a repository URL, a file path, a pasted command. Harper builds it
 * by interpolation — `Failed to clone package ${packageIdentifier}: ${cloneStderr}` and its
 * siblings in harper `components/Application.js` — so the identifier can appear in any shape the
 * import field accepts, including free text with spaces.
 *
 * Searching that text for identifiers is the wrong shape of solution: every candidate rule is a
 * guess about where the reference ends, and a reference is whatever the customer typed. The type
 * is the reliable signal instead — a relayed message is never composed by Studio, so none of it is
 * ours to publish and the whole string goes.
 *
 * Whatever `shouldKeepEvent` has not already dropped is still reported: the rate of these is how
 * an instance-side failure — a forge outage, a full disk on the deploying node — stays visible in
 * Error Tracking, and the stack keeps the frames that are ours. Telling those causes apart needs
 * `SSEOperationError`'s `code` and `phase`, which reach the browser but are not on the RUM event;
 * reporting them deliberately would restore that detail without the message.
 */
const RELAYED_ERROR_TYPES = new Set(['SSEOperationError']);

const WITHHELD = 'Harper reported an operation failure (server message withheld).';

function isRelayed(type: string | undefined) {
	return type !== undefined && RELAYED_ERROR_TYPES.has(type);
}

export function redactRelayedMessage(type: string | undefined, message: string) {
	return isRelayed(type) ? WITHHELD : message;
}

/**
 * The same for a stack: the SDK writes the message above the frames, so a relayed stack repeats it
 * — in production one carried the repository name and two kilobytes of `git clone` usage text.
 *
 * Removes exactly the message and keeps the remainder rather than selecting lines that look like
 * frames. Server text can be shaped like a frame: a customer pastes a newline and `  at x @
 * https://…` into the import field, Harper interpolates it, and any pattern that decides
 * line-by-line keeps it. There is nothing to decide if the span removed is the message itself.
 *
 * A stack that does not begin with the message is one whose shape we do not recognise, so it goes
 * whole — losing Studio's frames is the safe direction.
 */
export function redactRelayedStack(type: string | undefined, message: string, stack: string) {
	if (!isRelayed(type)) {
		return stack;
	}
	return stack.startsWith(message) ? `${WITHHELD}${stack.slice(message.length)}` : WITHHELD;
}
