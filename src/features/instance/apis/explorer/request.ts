import { fillPathTemplate } from '@/features/instance/apis/explorer/spec';
import { FlatOperation, HttpMethod } from '@/features/instance/apis/explorer/types';

/**
 * Auth the explorer applies to try-it-out requests. Every request is sent with
 * `credentials: 'include'`, so `cookie` means "rely on the browser's instance session cookie" with
 * no `Authorization` header; `basic`/`bearer` add an explicit `Authorization` header on top.
 */
export type ApiAuth =
	| { type: 'cookie' }
	| { type: 'basic'; username: string; password: string }
	| { type: 'bearer'; token: string };

/**
 * The credential-acquisition method the user picked in the Authorize panel. Distinct from the wire
 * `ApiAuth` so "Log in" can be a real, representable default and a logged-in state stays
 * distinguishable from a manually pasted Bearer token: `login` resolves to a `bearer` credential once
 * a token has been minted, but is presented and defaulted to on its own.
 */
export type AuthMethod = 'login' | 'basic' | 'bearer' | 'cookie';

/**
 * Whether the auth carries an explicit credential the request will actually send — a Basic username
 * or a Bearer token. `cookie` (and an empty Basic/Bearer) is not "authorized" in this sense: it only
 * relies on an ambient session cookie that may not be sent cross-site. Branch-only, allocation-free:
 * it runs on the sidebar's lock indicator during ordinary renders.
 */
export function isAuthorized(auth: ApiAuth): boolean {
	return (auth.type === 'basic' && typeof auth.username === 'string' && auth.username !== '')
		|| (auth.type === 'bearer' && typeof auth.token === 'string' && auth.token !== '');
}

export interface RequestInputs {
	pathParams: Record<string, string>;
	queryParams: Record<string, string>;
	headerParams: Record<string, string>;
	body: string;
}

/** A fully-resolved HTTP request ready to send (and to render as a code sample). */
export interface BuiltRequest {
	method: HttpMethod;
	url: string;
	headers: Record<string, string>;
	body?: string;
	/** Path parameter names that were left blank — the request can't be sent until these are filled. */
	missingPathParams: string[];
}

/** Methods that carry a request body. */
export function methodHasBody(method: HttpMethod): boolean {
	return method === 'post' || method === 'put' || method === 'patch';
}

/** Join a base URL and a path without doubling or dropping the separating slash. */
export function joinUrl(baseURL: string, path: string): string {
	if (!baseURL) {
		return path;
	}
	return `${baseURL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

// btoa only accepts Latin-1, so UTF-8 credentials (a password with an accent or emoji) must be
// byte-encoded first — otherwise btoa throws a DOMException, which here would be during render.
function base64(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function authHeader(auth: ApiAuth): Record<string, string> {
	switch (auth.type) {
		case 'basic':
			return { Authorization: `Basic ${base64(`${auth.username}:${auth.password}`)}` };
		case 'bearer':
			return { Authorization: `Bearer ${auth.token}` };
		default:
			return {};
	}
}

/**
 * Resolve a flat operation plus user inputs and auth into a concrete request. Path params are
 * substituted into the URL, non-empty query params are appended, and a JSON body + Content-Type are
 * included for body-bearing methods.
 */
export function buildRequest(
	op: FlatOperation,
	baseURL: string,
	inputs: RequestInputs,
	auth: ApiAuth,
): BuiltRequest {
	const { path, missing } = fillPathTemplate(op.path, inputs.pathParams);

	const query = new URLSearchParams();
	for (const [name, value] of Object.entries(inputs.queryParams)) {
		if (value !== '') {
			query.append(name, value);
		}
	}
	const queryString = query.toString();
	const url = joinUrl(baseURL, path) + (queryString ? `?${queryString}` : '');

	const headers: Record<string, string> = { Accept: 'application/json' };
	for (const [name, value] of Object.entries(inputs.headerParams)) {
		if (value !== '') {
			headers[name] = value;
		}
	}
	Object.assign(headers, authHeader(auth));

	const hasBody = methodHasBody(op.method) && inputs.body.trim() !== '';
	if (hasBody) {
		headers['Content-Type'] = 'application/json';
	}

	return {
		method: op.method,
		url,
		headers,
		body: hasBody ? inputs.body : undefined,
		missingPathParams: missing,
	};
}

/** The result of executing a try-it-out request, whether it succeeded or failed at the network level. */
export interface RequestResult {
	ok: boolean;
	status: number;
	statusText: string;
	headers: Record<string, string>;
	/** Response body as text; JSON is pretty-printed for display. */
	body: string;
	contentType: string | null;
	/** Round-trip time in milliseconds. */
	durationMs: number;
	/** Set when the request never got a response (network/CORS failure). */
	networkError?: string;
}

/**
 * Execute a built request with `fetch`, sending credentials so the instance's session cookie is
 * included — the same cross-origin, credentialed model Swagger UI used, which is why the CORS
 * warning on this page matters. A thrown fetch (network or CORS failure) is returned as a result
 * with `networkError` set rather than propagated, so the UI can explain it.
 */
export async function executeRequest(
	request: BuiltRequest,
	now: () => number = () => Date.now(),
): Promise<RequestResult> {
	const start = now();
	try {
		const response = await fetch(request.url, {
			method: request.method.toUpperCase(),
			headers: request.headers,
			body: request.body,
			credentials: 'include',
		});
		const { text, truncated } = await readCappedBody(response);
		const contentType = response.headers.get('content-type');
		const headers: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			headers[key] = value;
		});
		return {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers,
			body: formatResponseBody(text, contentType, truncated),
			contentType,
			durationMs: Math.round(now() - start),
		};
	} catch (error) {
		return {
			ok: false,
			status: 0,
			statusText: '',
			headers: {},
			body: '',
			contentType: null,
			durationMs: Math.round(now() - start),
			networkError: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Cap on the response body we read and render. A collection endpoint can return many megabytes;
 * buffering and pretty-printing all of it freezes the tab. `readCappedBody` streams only up to this
 * many characters and cancels the rest, and past it we show a truncated slice without pretty-printing.
 */
export const MAX_DISPLAY_BODY_CHARS = 512_000;

/**
 * Read a response body incrementally, stopping once `maxChars` is reached and cancelling the reader
 * so the unread tail is never buffered/downloaded. Falls back to `response.text()` when the body
 * isn't a readable stream (older runtimes, and jsdom in tests). Returns whether it was truncated.
 */
export async function readCappedBody(
	response: Response,
	maxChars: number = MAX_DISPLAY_BODY_CHARS,
): Promise<{ text: string; truncated: boolean }> {
	const reader = response.body?.getReader?.();
	if (!reader) {
		const text = await response.text();
		return text.length > maxChars ? { text: text.slice(0, maxChars), truncated: true } : { text, truncated: false };
	}
	const decoder = new TextDecoder();
	let text = '';
	try {
		while (text.length < maxChars) {
			const { done, value } = await reader.read();
			if (done) {
				text += decoder.decode();
				break;
			}
			text += decoder.decode(value, { stream: true });
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
	return text.length > maxChars ? { text: text.slice(0, maxChars), truncated: true } : { text, truncated: false };
}

/** Format a response body for display: note truncation, otherwise pretty-print JSON. */
export function formatResponseBody(text: string, contentType: string | null, truncated: boolean = false): string {
	if (truncated || text.length > MAX_DISPLAY_BODY_CHARS) {
		const shown = text.length > MAX_DISPLAY_BODY_CHARS ? text.slice(0, MAX_DISPLAY_BODY_CHARS) : text;
		return `${shown}\n\n… response truncated for display (first ${MAX_DISPLAY_BODY_CHARS} characters shown) …`;
	}
	return prettyPrintIfJson(text, contentType);
}

/** Pretty-print a JSON response body for display; return the raw text unchanged when it isn't JSON. */
export function prettyPrintIfJson(text: string, contentType: string | null): string {
	if (!text) {
		return '';
	}
	if (contentType && !contentType.includes('json')) {
		return text;
	}
	try {
		return JSON.stringify(JSON.parse(text), null, '\t');
	} catch {
		return text;
	}
}

/**
 * Render a built request as a copy-pasteable `fetch` snippet. Mirrors the Node.js fetch snippet the
 * previous Swagger integration generated (see the removed `apis/plugins.ts`), including
 * `credentials: 'include'` so the copied code reproduces the try-it-out behavior.
 */
export function buildFetchSnippet(request: BuiltRequest): string {
	const lines: string[] = [];
	const headerEntries = Object.entries(request.headers);
	lines.push(`const response = await fetch(${JSON.stringify(request.url)}, {`);
	lines.push(`\tmethod: ${JSON.stringify(request.method.toUpperCase())},`);
	lines.push(`\tcredentials: "include",`);
	if (headerEntries.length) {
		lines.push('\theaders: {');
		for (const [name, value] of headerEntries) {
			lines.push(`\t\t${JSON.stringify(name)}: ${JSON.stringify(value)},`);
		}
		lines.push('\t},');
	}
	if (request.body !== undefined) {
		// Embed the body as a template literal so multi-line JSON stays readable in the sample.
		const escaped = request.body.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
		lines.push(`\tbody: \`${escaped}\`,`);
	}
	lines.push('});');
	lines.push('const data = await response.json();');
	lines.push('console.log(data);');
	return lines.join('\n');
}
