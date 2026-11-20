import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SearchStreamError } from '@/integrations/api/instance/database/searchStreamError';
import { describeError } from '@/react-query/queryClient';
import { isAxiosError } from 'axios';
import { TriangleAlertIcon } from 'lucide-react';

type FailureKind = 'refused' | 'stopped' | 'unanswered';

const FAILURE_TITLE: Record<FailureKind, string> = {
	refused: 'Harper refused the search',
	stopped: 'Harper stopped the search partway',
	unanswered: 'The search got no answer',
};

function failureKind(error: unknown): FailureKind {
	if (error instanceof SearchStreamError) {
		return 'stopped';
	}
	return isAxiosError(error) && error.response ? 'refused' : 'unanswered';
}

/**
 * Harper refusing a search (a 4xx, a 503 while an index rebuilds, or a failure partway through) is what a
 * search tester is for, so it stays out of RUM; a failure with no answer at all is reported as usual.
 */
export function reportSearchFailure(error: unknown): void {
	if (failureKind(error) === 'unanswered') {
		console.error(error);
	} else {
		console.debug('Search refused', error);
	}
}

/** Harper's own words for a failed search, shown inline: in a tester that is the answer. */
export function SearchFailureAlert({ error }: { error: unknown }) {
	return (
		<Alert variant="destructive">
			<TriangleAlertIcon />
			<AlertTitle>{FAILURE_TITLE[failureKind(error)]}</AlertTitle>
			<AlertDescription>{describeError(error).message}</AlertDescription>
		</Alert>
	);
}
