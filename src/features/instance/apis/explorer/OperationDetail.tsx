import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from '@/features/instance/apis/explorer/CodeBlock';
import { MethodBadge } from '@/features/instance/apis/explorer/MethodBadge';
import { ApiAuth } from '@/features/instance/apis/explorer/request';
import { SchemaView } from '@/features/instance/apis/explorer/SchemaView';
import { generateExample, jsonSchemaFromContent, requiresAuth } from '@/features/instance/apis/explorer/spec';
import { httpStatusColorClass, STATUS_UNKNOWN_CLASS, StatusBadge } from '@/features/instance/apis/explorer/StatusBadge';
import { TryItOut } from '@/features/instance/apis/explorer/TryItOut';
import { FlatOperation, OpenApiSpec, Parameter, ResponseObject } from '@/features/instance/apis/explorer/types';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { CopyIcon, Lock } from 'lucide-react';
import { useMemo } from 'react';

/** Tint classes for a response key: a numeric HTTP code by class, else the unknown/`default` tint. */
function responseStatusColorClass(status: string): string {
	const code = Number(status);
	return Number.isFinite(code) ? httpStatusColorClass(code) : STATUS_UNKNOWN_CLASS;
}

/** Header + tabbed documentation/try-it view for a single selected operation. */
export function OperationDetail({
	op,
	spec,
	baseURL,
	auth,
	authorized,
	onOpenAuthorize,
}: {
	op: FlatOperation;
	spec: OpenApiSpec | undefined;
	baseURL: string | null;
	auth: ApiAuth;
	authorized: boolean;
	onOpenAuthorize: () => void;
}) {
	const [copyPath] = useCopyToClipboard(op.path);
	const authRequired = requiresAuth(op.operation, spec);
	const summary = op.operation.summary;
	const description = op.operation.description;

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<MethodBadge method={op.method} />
					<code className="text-foreground text-base font-medium break-all">{op.path}</code>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Copy path"
						className="size-7"
						onClick={copyPath}
					>
						<CopyIcon className="size-3.5" />
					</Button>
					{op.operation.deprecated && <Badge variant="warning">Deprecated</Badge>}
					{authRequired && (
						<button
							type="button"
							onClick={onOpenAuthorize}
							className="border-border hover:bg-accent/60 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors"
						>
							{authorized
								? <Lock className="text-green size-3" />
								: <Lock className="text-muted-foreground size-3" />}
							{authorized ? 'Authorized' : 'Auth required — Authorize'}
						</button>
					)}
				</div>
				{summary && <h2 className="text-lg font-medium">{summary}</h2>}
				{description && description !== summary && <p className="text-muted-foreground text-sm">{description}</p>}
			</div>

			<Tabs defaultValue="docs" className="gap-4">
				<TabsList>
					<TabsTrigger value="docs">Documentation</TabsTrigger>
					<TabsTrigger value="try">Try it out</TabsTrigger>
				</TabsList>

				<TabsContent value="docs" className="flex flex-col gap-6">
					<ParametersDoc parameters={op.parameters} />
					<RequestBodyDoc op={op} spec={spec} />
					<ResponsesDoc responses={op.operation.responses} spec={spec} />
				</TabsContent>

				<TabsContent value="try">
					<TryItOut
						op={op}
						spec={spec}
						baseURL={baseURL}
						auth={auth}
						authRequired={authRequired}
						authorized={authorized}
						onOpenAuthorize={onOpenAuthorize}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}

function SectionHeading({ children }: { children: React.ReactNode }) {
	return <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{children}</h3>;
}

function ParametersDoc({ parameters }: { parameters: Parameter[] }) {
	if (parameters.length === 0) {
		return null;
	}
	return (
		<section className="flex flex-col gap-3">
			<SectionHeading>Parameters</SectionHeading>
			<ul className="flex flex-col gap-3">
				{parameters.map(param => (
					<li key={`${param.in}:${param.name}`} className="flex flex-col gap-0.5">
						<div className="flex flex-wrap items-baseline gap-2">
							<code className="text-foreground font-medium">{param.name}</code>
							<Badge variant="outline" className="text-[0.65rem]">{param.in}</Badge>
							<span className="text-muted-foreground font-mono text-xs">
								{Array.isArray(param.schema?.type) ? param.schema?.type.join(' | ') : param.schema?.type ?? 'string'}
							</span>
							{param.required && <span className="text-red text-xs font-medium">required</span>}
						</div>
						{param.description && <p className="text-muted-foreground text-xs">{param.description}</p>}
					</li>
				))}
			</ul>
		</section>
	);
}

function RequestBodyDoc({ op, spec }: { op: FlatOperation; spec: OpenApiSpec | undefined }) {
	const requestBody = op.operation.requestBody;
	const schema = requestBody ? jsonSchemaFromContent(requestBody.content) : undefined;
	// Example generation is a recursive traversal; memoize so unrelated re-renders (e.g. sidebar
	// filter keystrokes) don't regenerate it.
	const example = useMemo(() => (schema ? JSON.stringify(generateExample(spec, schema), null, '\t') : ''), [
		spec,
		schema,
	]);
	if (!requestBody) {
		return null;
	}
	return (
		<section className="flex flex-col gap-3">
			<SectionHeading>
				Request body{requestBody.required ? ' (required)' : ''}
			</SectionHeading>
			{requestBody.description && <p className="text-muted-foreground text-sm">{requestBody.description}</p>}
			<SchemaView spec={spec} schema={schema} />
			{example && example !== '{}' && example !== 'null' && (
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs">Example</span>
					<CodeBlock code={example} label="example request body" maxHeightClassName="max-h-72" />
				</div>
			)}
		</section>
	);
}

function ResponsesDoc({
	responses,
	spec,
}: {
	responses: Record<string, ResponseObject> | undefined;
	spec: OpenApiSpec | undefined;
}) {
	const entries = Object.entries(responses ?? {});
	if (entries.length === 0) {
		return null;
	}
	return (
		<section className="flex flex-col gap-3">
			<SectionHeading>Responses</SectionHeading>
			<div className="flex flex-col gap-4">
				{entries.map(([status, response]) => {
					const schema = jsonSchemaFromContent(response.content);
					return (
						<div key={status} className="flex flex-col gap-2">
							<div className="flex items-baseline gap-2">
								<StatusBadge colorClass={responseStatusColorClass(status)}>{status}</StatusBadge>
								{response.description && <span className="text-muted-foreground text-sm">{response.description}</span>}
							</div>
							{schema && (
								<div className="pl-1">
									<SchemaView spec={spec} schema={schema} />
								</div>
							)}
						</div>
					);
				})}
			</div>
		</section>
	);
}
