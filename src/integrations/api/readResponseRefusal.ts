import { errorText } from '@/lib/errorText';

const MAX_REFUSAL_LENGTH = 1000;

/** Harper's own words refusing a request, which can quote what the customer sent: withheld from RUM. */
export class HarperRefusalError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'HarperRefusalError';
	}
}

/** Harper's own words from a refused `fetch` response, if it gave any. */
export async function readResponseRefusal(response: Response): Promise<string | undefined> {
	const text = (await response.text().catch(() => '')).trim();
	if (!text) {
		return undefined;
	}
	const parsed = parseJson(text);
	if (parsed && typeof parsed === 'object') {
		const { error, message, detail, title } = parsed as Record<string, unknown>;
		const said = errorText(error) ?? errorText(message) ?? errorText(detail) ?? errorText(title);
		if (said) {
			return said.slice(0, MAX_REFUSAL_LENGTH);
		}
	}
	return text.slice(0, MAX_REFUSAL_LENGTH);
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}
