import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CodeBlock } from '@/features/instance/apis/explorer/CodeBlock';
import {
	ApiAuth,
	buildFetchSnippet,
	buildRequest,
	executeRequest,
	methodHasBody,
	RequestInputs,
	RequestResult,
} from '@/features/instance/apis/explorer/request';
import { generateExample, jsonSchemaFromContent, pathParametersFor } from '@/features/instance/apis/explorer/spec';
import { httpStatusColorClass, StatusBadge } from '@/features/instance/apis/explorer/StatusBadge';
import { FlatOperation, OpenApiSpec, Parameter } from '@/features/instance/apis/explorer/types';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { WORKER_FREE_JSON_LANGUAGE_ID } from '@/lib/monaco/workerFreeJsonLanguage';
import { Play } from 'lucide-react';
import { useMemo, useState } from 'react';

/** Initial JSON body text generated from the operation's request-body schema (empty if none). */
function initialBody(spec: OpenApiSpec | undefined, op: FlatOperation): string {
	if (!methodHasBody(op.method) || !op.operation.requestBody) {
		return '';
	}
	const schema = jsonSchemaFromContent(op.operation.requestBody.content);
	if (!schema) {
		return '';
	}
	return JSON.stringify(generateExample(spec, schema), null, '\t');
}

/**
 * The interactive request runner for one operation. Renders inputs for the operation's path/query/
 * header parameters and (for body methods) a JSON body editor, builds the request, sends it with the
 * session cookie, and shows the response. A code sample of the equivalent `fetch` call is always shown.
 */
export function TryItOut({
	op,
	spec,
	baseURL,
	auth,
}: {
	op: FlatOperation;
	spec: OpenApiSpec | undefined;
	baseURL: string | null;
	auth: ApiAuth;
}) {
	const monacoTheme = useMonacoTheme();

	const pathParamDefs = pathParametersFor(op);
	const queryParamDefs = op.parameters.filter(p => p.in === 'query');
	const headerParamDefs = op.parameters.filter(p => p.in === 'header');

	const [pathParams, setPathParams] = useState<Record<string, string>>({});
	const [queryParams, setQueryParams] = useState<Record<string, string>>({});
	const [headerParams, setHeaderParams] = useState<Record<string, string>>({});
	const [body, setBody] = useState<string>(() => initialBody(spec, op));
	const [result, setResult] = useState<RequestResult | null>(null);
	const [isSending, setIsSending] = useState(false);

	const inputs: RequestInputs = { pathParams, queryParams, headerParams, body };
	const request = useMemo(
		() => buildRequest(op, baseURL ?? '', inputs, auth),
		// The built request depends on the operation, base URL, auth, and every input map/body.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[op, baseURL, auth, pathParams, queryParams, headerParams, body],
	);

	const hasBody = methodHasBody(op.method) && !!op.operation.requestBody;
	// Gate Send on every required input the request contract can mark, not just path params — sending a
	// request known to be incomplete only produces an avoidable server error.
	const missingRequired: string[] = [
		...request.missingPathParams,
		...queryParamDefs.filter(p => p.required && !queryParams[p.name]?.trim()).map(p => p.name),
		...headerParamDefs.filter(p => p.required && !headerParams[p.name]?.trim()).map(p => p.name),
		...(hasBody && op.operation.requestBody?.required && body.trim() === '' ? ['request body'] : []),
	];
	const canSend = !!baseURL && missingRequired.length === 0 && !isSending;

	async function send() {
		setIsSending(true);
		setResult(null);
		const res = await executeRequest(request);
		setResult(res);
		setIsSending(false);
	}

	return (
		<div className="flex flex-col gap-5">
			{pathParamDefs.length > 0 && (
				<ParamInputs
					title="Path parameters"
					params={pathParamDefs}
					values={pathParams}
					onChange={setPathParams}
				/>
			)}
			{queryParamDefs.length > 0 && (
				<ParamInputs
					title="Query parameters"
					params={queryParamDefs}
					values={queryParams}
					onChange={setQueryParams}
				/>
			)}
			{headerParamDefs.length > 0 && (
				<ParamInputs
					title="Header parameters"
					params={headerParamDefs}
					values={headerParams}
					onChange={setHeaderParams}
				/>
			)}

			{hasBody && (
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Request body</span>
					<div className="h-56 overflow-hidden rounded-md border">
						<Editor
							className="h-full w-full"
							language={WORKER_FREE_JSON_LANGUAGE_ID}
							theme={monacoTheme}
							value={body}
							onChange={value => setBody(value ?? '')}
							options={{
								minimap: { enabled: false },
								automaticLayout: true,
								scrollBeyondLastLine: false,
								fontSize: 12,
								lineNumbers: 'off',
								folding: false,
							}}
						/>
					</div>
				</div>
			)}

			<div className="flex flex-wrap items-center gap-3">
				<Button variant="submit" onClick={send} disabled={!canSend}>
					<Play />
					{isSending ? 'Sending…' : 'Send request'}
				</Button>
				{!baseURL && (
					<span className="text-muted-foreground text-xs">
						The REST API URL couldn&apos;t be determined for this instance.
					</span>
				)}
				{baseURL && missingRequired.length > 0 && (
					<span className="text-muted-foreground text-xs">
						Fill in: {missingRequired.join(', ')}
					</span>
				)}
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Request</span>
				<div className="bg-muted/60 flex items-center gap-2 overflow-x-auto rounded-md border px-3 py-2 font-mono text-xs">
					<span className="uppercase">{request.method}</span>
					<span className="text-muted-foreground">{request.url}</span>
				</div>
			</div>

			{result && <ResponseView result={result} />}

			<div className="flex flex-col gap-1.5">
				<span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Code sample — fetch</span>
				<CodeBlock code={buildFetchSnippet(request)} label="code sample" />
			</div>
		</div>
	);
}

function ParamInputs({
	title,
	params,
	values,
	onChange,
}: {
	title: string;
	params: Parameter[];
	values: Record<string, string>;
	onChange: (values: Record<string, string>) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{title}</span>
			<div className="flex flex-col gap-3">
				{params.map(param => (
					<div key={`${param.in}:${param.name}`} className="flex flex-col gap-1.5">
						<Label htmlFor={`param-${param.in}-${param.name}`} className="flex items-baseline gap-2">
							<code>{param.name}</code>
							{param.required && <span className="text-red text-xs font-medium">required</span>}
							{param.schema && (
								<span className="text-muted-foreground font-mono text-xs font-normal">
									{Array.isArray(param.schema.type) ? param.schema.type.join(' | ') : param.schema.type ?? 'string'}
								</span>
							)}
						</Label>
						<Input
							id={`param-${param.in}-${param.name}`}
							value={values[param.name] ?? ''}
							placeholder={param.description || param.name}
							onChange={e => onChange({ ...values, [param.name]: e.target.value })}
						/>
					</div>
				))}
			</div>
		</div>
	);
}

function ResponseView({ result }: { result: RequestResult }) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-3">
				<span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Response</span>
				<StatusBadge colorClass={httpStatusColorClass(result.status)}>
					{result.networkError ? 'Failed' : `${result.status} ${result.statusText}`.trim()}
				</StatusBadge>
				<span className="text-muted-foreground text-xs">{result.durationMs} ms</span>
			</div>

			{result.networkError
				? (
					<div className="border-red/40 bg-red/10 text-foreground rounded-md border p-3 text-sm">
						<p className="text-red font-medium">The request could not be completed.</p>
						<p className="text-muted-foreground mt-1 text-xs">{result.networkError}</p>
						<p className="text-muted-foreground mt-2 text-xs">
							This is usually a CORS or connectivity issue — check that CORS is enabled for this origin (see the banner
							above) and that the instance is reachable.
						</p>
					</div>
				)
				: (
					<CodeBlock
						code={result.body || '(empty response body)'}
						label="response body"
					/>
				)}
		</div>
	);
}
