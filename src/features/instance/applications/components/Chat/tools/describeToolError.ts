import { isUnansweredWrite, UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';

export function describeToolError(err: unknown): string {
	return isUnansweredWrite(err) ? UNANSWERED_WRITE_MESSAGE : String(err);
}
