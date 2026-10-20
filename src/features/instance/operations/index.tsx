import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alertDialog';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/buttonVariants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { EntityIds } from '@/features/auth/store/authStore';
import { CodeBlock } from '@/features/instance/apis/explorer/CodeBlock';
import { httpStatusColorClass, StatusBadge } from '@/features/instance/apis/explorer/StatusBadge';
import { describeRecordJsonError, RecordJsonError } from '@/features/instance/databases/modals/recordEditorJson';
import { useRecordJsonErrorMarker } from '@/features/instance/databases/modals/recordJsonErrorMarker';
import { isBuiltInRead } from '@/features/instance/operations/operationKinds';
import { OperationRequest, parseOperationRequest } from '@/features/instance/operations/parseOperationRequest';
import { MAX_RESPONSE_BYTES, OperationResult, sendOperation } from '@/features/instance/operations/sendOperation';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import {
	RESTART_MARK_TTL_MS,
	waitUntilAnsweringAfterRestart,
} from '@/integrations/api/instance/status/restartInstance';
import { humanFileSize } from '@/lib/humanFileSize';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { WORKER_FREE_JSON_LANGUAGE_ID } from '@/lib/monaco/workerFreeJsonLanguage';
import { markRestarting } from '@/lib/restart/restartTracker';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { invalidateEntityQueries } from '@/react-query/invalidateEntityQueries';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useParams } from '@tanstack/react-router';
import type { AxiosInstance } from 'axios';
import { Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const OPERATIONS_API_DOCS = 'https://docs.harperdb.io/docs/developers/operations-api/';
const INITIAL_REQUEST = '{\n\t"operation": "describe_all"\n}\n';
const CONFIRM_PREVIEW_CHARS = 4_000;
const LOGOUT_REFUSAL = 'Sign out from Studio instead: a logout sent from here would end the session the rest of '
	+ 'Studio is still using, without Studio knowing.';

export function OperationsIndex() {
	const params = useParams({ strict: false });
	const { instanceClient, entityId, entityType } = useInstanceClientIdParams();
	const canManage = useInstanceManagePermission(entityId);
	const { user } = useInstanceAuth(entityId);

	if (!canManage) {
		// No user yet means auth is still resolving; redirecting then would bounce a super user too.
		return user ? <Navigate to={buildAbsoluteLinkToPage(params, 'databases')} /> : null;
	}
	return (
		<OperationsConsole
			// The router keeps this page mounted across a switch to another instance, and a buffer or a
			// pending confirmation written for one must never be sent to the next.
			key={entityId}
			instanceClient={instanceClient}
			entityId={entityId}
			noun={entityType}
			username={user?.username}
		/>
	);
}

function OperationsConsole({ instanceClient, entityId, noun, username }: {
	instanceClient: AxiosInstance;
	entityId: EntityIds;
	noun: 'instance' | 'cluster';
	username?: string;
}) {
	const monacoTheme = useMonacoTheme();
	const queryClient = useQueryClient();
	const { onEditorMount, showRecordJsonError, clearRecordJsonError } = useRecordJsonErrorMarker();
	const [text, setText] = useState(INITIAL_REQUEST);
	const [inputError, setInputError] = useState<RecordJsonError | null>(null);
	const [awaitingConfirmation, setAwaitingConfirmation] = useState<OperationRequest | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [sent, setSent] = useState<{ operation: string; result: OperationResult } | null>(null);
	// A ref, not `isSending`: two clicks can land before React commits the disabled button.
	const inFlight = useRef(false);
	const lifetime = useRef<AbortController | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		lifetime.current = controller;
		return () => controller.abort();
	}, []);

	async function send(request: OperationRequest) {
		if (inFlight.current) {
			return;
		}
		inFlight.current = true;
		setIsSending(true);
		setSent(null);
		const signal = lifetime.current?.signal;
		// Tracked like the Restart button's, so the page's polls ride out the outage instead of failing
		// into the global error handlers.
		const releaseRestart = request.operation === 'restart'
			? markRestarting([entityId], { reach: noun === 'instance' ? 'down' : 'rolling', ttlMs: RESTART_MARK_TTL_MS })
			: undefined;
		try {
			const result = await sendOperation(instanceClient, request.text, {
				signal,
				skipRestartGate: !!releaseRestart,
			});
			const reachedHarper = !(result.kind === 'failed' && !result.mayHaveRun);
			if (releaseRestart) {
				// A 4xx is a restart refused; a 5xx can be a gateway that lost the answer to one that ran
				// and took the instance down mid-reply.
				const refused = !reachedHarper || (result.kind === 'response' && result.status >= 400 && result.status < 500);
				if (refused) {
					releaseRestart();
				} else {
					void waitUntilAnsweringAfterRestart({ instanceClient }).then(releaseRestart, releaseRestart);
				}
			}
			// Even an error answer: an arbitrary operation can change something before it fails.
			if (!isBuiltInRead(request.operation) && reachedHarper) {
				// Stale, not refetched: the refetch would race whatever the operation just did.
				void invalidateEntityQueries(queryClient, entityId, { refetchType: 'none' });
			}
			if (!signal?.aborted) {
				setSent({ operation: request.operation, result });
			}
		} finally {
			inFlight.current = false;
			if (!signal?.aborted) {
				setIsSending(false);
			}
		}
	}

	function submit() {
		if (inFlight.current) {
			return;
		}
		const parsed = parseOperationRequest(text);
		if (!parsed.ok) {
			setInputError(parsed.error);
			showRecordJsonError(parsed.error);
			return;
		}
		if (parsed.request.operation === 'logout') {
			setInputError({ message: LOGOUT_REFUSAL });
			return;
		}
		setInputError(null);
		if (isBuiltInRead(parsed.request.operation)) {
			void send(parsed.request);
		} else {
			setAwaitingConfirmation(parsed.request);
		}
	}

	return (
		<div className="flex max-w-6xl flex-col gap-4 px-4 py-4 text-foreground md:px-12">
			<div className="flex flex-col gap-1">
				<h1 className="text-xl font-semibold">Operations API</h1>
				<p className="text-muted-foreground text-sm">
					Send one operations-API request to{' '}
					{username ? `this ${noun} as ${username}` : `this ${noun}`}. Harper checks your permissions for each
					operation. See the{' '}
					<a href={OPERATIONS_API_DOCS} target="_blank" rel="noreferrer" className="underline underline-offset-2">
						Operations API reference
					</a>{' '}
					for what you can send.
				</p>
				{noun === 'cluster' && (
					<p className="text-muted-foreground text-sm">
						Each request runs on one node of the cluster. To target a specific node, open it from the cluster&apos;s
						Instances list.
					</p>
				)}
			</div>

			<div className="h-72 overflow-hidden rounded-md border">
				<Editor
					className="h-full w-full"
					language={WORKER_FREE_JSON_LANGUAGE_ID}
					theme={monacoTheme}
					value={text}
					onChange={(value) => {
						setText(value ?? '');
						setInputError(null);
						clearRecordJsonError();
					}}
					onMount={onEditorMount}
					options={{
						minimap: { enabled: false },
						automaticLayout: true,
						scrollBeyondLastLine: false,
						fontSize: 13,
					}}
				/>
			</div>

			{inputError && <p role="alert" className="text-red text-sm">{describeRecordJsonError(inputError)}</p>}

			<div>
				<Button variant="submit" onClick={submit} disabled={isSending}>
					<Play />
					{isSending ? 'Sending…' : 'Send'}
				</Button>
			</div>

			{sent && <ResultView operation={sent.operation} result={sent.result} />}

			<ConfirmOperationDialog
				request={awaitingConfirmation}
				noun={noun}
				onCancel={() => setAwaitingConfirmation(null)}
				onConfirm={(request) => {
					setAwaitingConfirmation(null);
					void send(request);
				}}
			/>
		</div>
	);
}

function ConfirmOperationDialog({ request, noun, onCancel, onConfirm }: {
	request: OperationRequest | null;
	noun: 'instance' | 'cluster';
	onCancel: () => void;
	onConfirm: (request: OperationRequest) => void;
}) {
	// The content stays mounted through the close animation, after `request` is already null.
	const [lastRequest, setLastRequest] = useState(request);
	if (request && request !== lastRequest) {
		setLastRequest(request);
	}
	const shown = request ?? lastRequest;
	const preview = shown && shown.text.length > CONFIRM_PREVIEW_CHARS
		? `${shown.text.slice(0, CONFIRM_PREVIEW_CHARS)}\n…`
		: shown?.text;
	return (
		<AlertDialog open={!!request} onOpenChange={(open) => !open && onCancel()}>
			<AlertDialogContent className="text-popover-foreground sm:max-w-2xl">
				<AlertDialogHeader>
					<AlertDialogTitle>
						Run <code className="font-mono">{shown?.operation}</code> on this {noun}?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This isn&apos;t a read, so it can change data, users, or configuration, and Harper may not be able to undo
						it.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<pre className="bg-muted/40 max-h-48 overflow-auto rounded-md border p-2 font-mono text-xs whitespace-pre-wrap break-all">
					{preview}
				</pre>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className={buttonVariants({ variant: 'destructive' })}
						onClick={() => request && onConfirm(request)}
					>
						Run {shown?.operation}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function ResultView({ operation, result }: { operation: string; result: OperationResult }) {
	return (
		<section aria-label={`Result of ${operation}`} className="flex flex-col gap-2">
			<div className="flex items-center gap-3">
				<span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Response</span>
				{result.kind === 'response'
					? (
						<StatusBadge colorClass={httpStatusColorClass(result.status)}>
							{`${result.status} ${result.statusText}`.trim()}
						</StatusBadge>
					)
					: (
						<StatusBadge colorClass={httpStatusColorClass(0)}>
							{result.kind === 'too-large' ? 'Too large' : 'Failed'}
						</StatusBadge>
					)}
				<span className="text-muted-foreground text-xs">{result.durationMs} ms</span>
			</div>
			{result.kind === 'response' && <CodeBlock code={result.body || '(empty response body)'} label="response body" />}
			{result.kind === 'too-large' && (
				<div className="border-yellow/40 bg-yellow/10 rounded-md border p-3 text-sm">
					Harper answered, but the response was over{' '}
					{humanFileSize(MAX_RESPONSE_BYTES)}, so Studio stopped downloading it. Narrow the request (for example, with a
					limit) to see the result here.
				</div>
			)}
			{result.kind === 'failed' && (
				<div className="border-red/40 bg-red/10 rounded-md border p-3 text-sm">
					<p className="text-red font-medium">No response from Harper.</p>
					<p className="text-muted-foreground mt-1 text-xs">{result.message}</p>
					<p className="text-muted-foreground mt-2 text-xs">
						{result.mayHaveRun
							? `The ${operation} operation may or may not have run. Check before sending it again.`
							: `The ${operation} operation was not sent.`}
					</p>
				</div>
			)}
		</section>
	);
}
