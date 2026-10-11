import { type RecordJsonError, tryParseJson } from '@/features/instance/databases/modals/recordEditorJson';

export interface OperationRequest {
	text: string;
	operation: string;
}

type ParsedOperationRequest = { ok: true; request: OperationRequest } | { ok: false; error: RecordJsonError };

export function parseOperationRequest(text: string): ParsedOperationRequest {
	if (!text.trim()) {
		return { ok: false, error: { message: 'The editor is empty, so there is nothing to send.' } };
	}
	const parsed = tryParseJson(text);
	if (!parsed.ok) {
		return parsed;
	}
	const { value } = parsed;
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return { ok: false, error: { message: 'A request has to be a single JSON object.' } };
	}
	const { operation } = value as { operation?: unknown };
	if (typeof operation !== 'string' || !operation.trim()) {
		return {
			ok: false,
			error: { message: 'The request needs an "operation" naming what to run, such as "describe_all".' },
		};
	}
	return { ok: true, request: { text, operation } };
}
