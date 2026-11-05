import { errorText } from '@/lib/errorText';

const MAX_REFUSAL_LENGTH = 1000;

/**
 * Harper's own words from a refused `fetch` response, if it gave any: `{ error }`, `{ message }`, or a problem
 * document's `detail`/`title`, else the text.
 */
export async function readResponseRefusal(response: Response): Promise<string | undefined> {
	const text = (await response.text().catch(() => '')).trim();
	if (!text) {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(text);
		if (parsed && typeof parsed === 'object') {
			const { error, message, detail, title } = parsed as Record<string, unknown>;
			const said = errorText(error) ?? errorText(message) ?? errorText(detail) ?? errorText(title);
			if (said) {
				return said.slice(0, MAX_REFUSAL_LENGTH);
			}
		}
	} catch {
		// Not JSON: the text itself is the answer.
	}
	return text.slice(0, MAX_REFUSAL_LENGTH);
}
