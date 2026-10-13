import { isUnansweredWrite, UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';
import { describeError } from '@/react-query/queryClient';
import { toast } from 'sonner';

export function describeToolError(err: unknown): string {
	return isUnansweredWrite(err) ? UNANSWERED_WRITE_MESSAGE : String(err);
}

/** A loading toast never dismisses itself, so a failed tool must replace its progress toast. */
export function toastToolFailure(toastId: string | number, err: unknown) {
	const { title, description } = describeError(err);
	toast.error(title, { id: toastId, description, duration: 10_000 });
}
