import { formatResponseBody } from '@/features/instance/apis/explorer/request';
import { errorText } from '@/lib/errorText';
import { RESTARTING_ERROR_CODE } from '@/lib/restart/restartGate';
import { type AxiosInstance, isAxiosError } from 'axios';

/**
 * The download is abandoned once progress reports more than this. axios buffers a whole body before
 * resolving, and the browser reports progress about every 50 ms, so this bounds how much an
 * unbounded `search` can pull into the tab rather than capping it to the byte.
 */
export const MAX_RESPONSE_BYTES = 5_000_000;

export type OperationResult =
	| { kind: 'response'; status: number; statusText: string; durationMs: number; body: string }
	| { kind: 'too-large'; durationMs: number }
	| { kind: 'failed'; durationMs: number; message: string; mayHaveRun: boolean };

/**
 * Send one operations-API body and describe what came back. Never throws: every failure becomes a
 * result the page renders inline, so nothing here reaches the global error handlers.
 *
 * `text` is sent as typed rather than re-serialized from a parse, which would round integers past
 * 2^53 (a primary key among them) before Harper ever saw them.
 */
export async function sendOperation(
	instanceClient: Pick<AxiosInstance, 'post'>,
	text: string,
	{ signal, skipRestartGate, now = () => Date.now() }: {
		signal?: AbortSignal;
		skipRestartGate?: boolean;
		now?: () => number;
	} = {},
): Promise<OperationResult> {
	const start = now();
	const elapsed = () => Math.round(now() - start);
	if (signal?.aborted) {
		return {
			kind: 'failed',
			durationMs: 0,
			message: 'The request was cancelled before it was sent.',
			mayHaveRun: false,
		};
	}
	const download = new AbortController();
	const abandon = () => download.abort();
	signal?.addEventListener('abort', abandon);
	let tooLarge = false;
	try {
		const response = await instanceClient.post('/', text, {
			responseType: 'text',
			skipGatewayRetry: true,
			skipRestartGate,
			signal: download.signal,
			onDownloadProgress: ({ loaded }) => {
				if (loaded > MAX_RESPONSE_BYTES) {
					tooLarge = true;
					download.abort();
				}
			},
		});
		return describeResponse(response, elapsed());
	} catch (error) {
		if (tooLarge) {
			return { kind: 'too-large', durationMs: elapsed() };
		}
		if (isAxiosError(error) && error.response) {
			return describeResponse(error.response, elapsed());
		}
		if (download.signal.aborted) {
			// Abandoned mid-flight: aborting the download does not undo a write Harper already took.
			return {
				kind: 'failed',
				durationMs: elapsed(),
				message: 'Studio stopped waiting for the answer.',
				mayHaveRun: true,
			};
		}
		return { kind: 'failed', durationMs: elapsed(), ...describeFailure(error) };
	} finally {
		signal?.removeEventListener('abort', abandon);
	}
}

function describeResponse(
	{ status, statusText, data, headers }: { status: number; statusText?: string; data?: unknown; headers?: unknown },
	durationMs: number,
): OperationResult {
	const contentType = (headers as Record<string, unknown> | undefined)?.['content-type'];
	return {
		kind: 'response',
		status,
		statusText: statusText ?? '',
		durationMs,
		body: formatResponseBody(bodyText(data), typeof contentType === 'string' ? contentType : null),
	};
}

function bodyText(data: unknown): string {
	if (typeof data === 'string') {
		return data;
	}
	try {
		return JSON.stringify(data) ?? '';
	} catch {
		return '';
	}
}

/**
 * Whether an unanswered request may still have been applied is what decides if resending is safe.
 * Only Studio's own gates refuse before sending: the restart gate, and a client cancelling a request
 * whose connection changed under it.
 */
function describeFailure(error: unknown): { message: string; mayHaveRun: boolean } {
	if (isAxiosError(error) && (error.code === RESTARTING_ERROR_CODE || error.code === 'ERR_CANCELED')) {
		return { message: errorText(error) ?? 'The request was cancelled before it was sent.', mayHaveRun: false };
	}
	return { message: errorText(error) ?? 'The request failed before Harper answered.', mayHaveRun: true };
}
