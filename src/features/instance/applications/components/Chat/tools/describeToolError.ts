import { isUnansweredWrite, UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';
import { describeError } from '@/react-query/queryClient';
import { toast } from 'sonner';

export function describeToolError(err: unknown): string {
	return isUnansweredWrite(err) ? UNANSWERED_WRITE_MESSAGE : String(err);
}

/** Replace a tool's progress toast with what its failure means; a loading toast never dismisses itself. */
export function toastToolFailure(toastId: string | number, err: unknown) {
	const { title, description } = describeError(err);
	toast.error(title, { id: toastId, description, duration: 10_000 });
}
