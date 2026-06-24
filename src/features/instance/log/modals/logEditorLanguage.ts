import { MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';

function isJsonString(str: string): boolean {
	try {
		JSON.parse(str);
	} catch {
		return false;
	}
	return true;
}

/**
 * Pick the editor language for a log message. JSON entries get syntax
 * highlighting — but only when small enough to be safe: the `json` language runs
 * a worker, and Monaco clones the model's full text to it over `postMessage`. An
 * oversized message overflows the structured-clone buffer and crashes the worker
 * ("DataCloneError: ... out of memory.", followed by "FAILED to post message to
 * worker"), flooding the session with unhandled errors. Oversized or non-JSON
 * messages render as `plaintext`, which has no language worker — the same guard
 * the Applications editor applies to large files.
 */
export function chooseLogEditorLanguage(message: string | undefined | null): 'json' | 'plaintext' {
	if (!message || message.length > MAX_WORKER_MODEL_CHARS) {
		return 'plaintext';
	}
	return isJsonString(message) ? 'json' : 'plaintext';
}
