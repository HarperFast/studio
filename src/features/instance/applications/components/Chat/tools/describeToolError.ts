import { isUnansweredWrite, UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';

/** A failed tool call, as the agent reads it: told plainly when a retry could apply a write twice. */
export function describeToolError(err: unknown): string {
	return isUnansweredWrite(err) ? UNANSWERED_WRITE_MESSAGE : String(err);
}
