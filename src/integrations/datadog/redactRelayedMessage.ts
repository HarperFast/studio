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
 * The event itself is kept. Its rate is how an instance-side failure — a forge outage, a full disk
 * on the deploying node — stays visible in Error Tracking, and the stack is Studio's own frames.
 * Telling those causes apart needs `SSEOperationError`'s `code` and `phase`, which reach the
 * browser but are not on the RUM event; reporting them deliberately would restore that detail
 * without the message.
 */
const RELAYED_ERROR_TYPES = new Set(['SSEOperationError']);

const WITHHELD = 'Harper reported an operation failure (server message withheld).';

/**
 * One frame of a stack the SDK re-serialized: `  at <func> @ <url>:<line>:<col>`. Requiring the
 * ` @ <url>` tail is what separates a frame from a line of the message that happens to begin with
 * "at"; the trailing `\s*` keeps a CRLF stack from failing to match.
 */
const STACK_FRAME = /^\s*at\s.* @ \S+\s*$/;

function isRelayed(type: string | undefined) {
	return type !== undefined && RELAYED_ERROR_TYPES.has(type);
}

/** Returns `message` unchanged unless `type` names an error whose text the server composed. */
export function redactRelayedMessage(type: string | undefined, message: string) {
	return isRelayed(type) ? WITHHELD : message;
}

/**
 * The same for a stack: the SDK writes `<Name>: <message>` above the frames, so a relayed stack
 * repeats the whole server message — in production one carried the repository name and two
 * kilobytes of `git clone` usage text. Keep the frames, which are Studio's own, and rebuild the
 * header.
 */
export function redactRelayedStack(type: string | undefined, stack: string) {
	if (!isRelayed(type)) {
		return stack;
	}
	const frames = stack.split('\n').filter((line) => STACK_FRAME.test(line));
	return [`${type}: ${WITHHELD}`, ...frames].join('\n');
}
