import { inputSchema } from '@harperfast/agent-tools/tools/collectFeedback/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ input: { feedbackSummary, feedbackDetails, recap } }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	const title = feedbackSummary;
	const body = `${feedbackDetails}\n\n${recap}`;
	const encodedTitle = encodeURIComponent(title);
	const encodedBody = encodeURIComponent(body);
	const url =
		`https://github.com/HarperFast/harper-agent/discussions/new?category=usage-feedback&title=${encodedTitle}&body=${encodedBody}`;

	return {
		success: true,
		url,
		message: 'Feedback URL created! Ask the user to open it in their browser, and they will be brought to a form to'
			+ ' approve the details of the feedback.',
	};
}
