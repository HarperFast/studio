import './WorkflowDetail.css';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
	Collapsible,
	DetailRow,
	JsonBlock,
	RefreshFailed,
	Timestamp,
	WorkflowStatusBadge,
} from '@/features/admin/workflows/components/WorkflowBits';
import { WorkflowCommands } from '@/features/admin/workflows/components/WorkflowCommands';
import {
	WorkflowDetail,
	workflowDetailQueryOptions,
	WorkflowPlanStep,
} from '@/features/admin/workflows/workflowAdminApi';
import {
	batchProgress,
	describeStep,
	heldClusterIds,
	itemTree,
	ItemTreeRow,
	pauseLabel,
	stepRuns,
	workflowTypeLabel,
} from '@/features/admin/workflows/workflowProgress';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { AxiosError } from 'axios';
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon, Loader2Icon } from 'lucide-react';
import { Fragment, ReactNode, useMemo, useState } from 'react';

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="mt-6 min-w-0 overflow-hidden rounded-xl border bg-card/70 shadow-sm">
			<div className="border-b px-5 py-4">
				<h2 className="text-sm font-semibold">{title}</h2>
			</div>
			<div className="p-4 sm:p-5">{children}</div>
		</section>
	);
}

function BatchInstances({ state, batchId }: { state: unknown; batchId: string }) {
	const batches = (state as { batches?: Record<string, unknown> } | null)?.batches;
	const instanceIds = batches?.[batchId];
	if (
		!Array.isArray(instanceIds) || !instanceIds.length
		|| !instanceIds.every((id) => typeof id === 'string' && id.length > 0)
	) {
		return null;
	}
	return (
		<div className="mt-1 text-xs text-muted-foreground">
			<span className="font-mono break-all">{instanceIds.join(', ')}</span>
		</div>
	);
}

interface WorkflowStepRow extends ItemTreeRow {
	definition?: WorkflowPlanStep;
}

function workflowStepRows(detail: WorkflowDetail): WorkflowStepRow[] {
	const plan = detail.plan ?? [];
	const definitions = new Map(plan.map((step) => [step.path, step]));
	const executions = new Map(detail.items.map((item) => [item.stepPath, item]));
	const collections = new Set<string>();
	const rows: WorkflowStepRow[] = [];
	const collectionDepth = (path: string) => [...collections].filter((parent) => path.startsWith(`${parent}/`)).length;
	for (const row of itemTree(detail)) {
		const definitionPath = row.definitionPath;
		const definition = definitionPath ? definitions.get(definitionPath) : undefined;
		if (row.kind === 'group' && definition) {
			const path = row.path.slice(0, row.path.lastIndexOf('/'));
			if (!collections.has(path)) {
				rows.push({
					path,
					depth: row.depth + collectionDepth(path),
					kind: 'step',
					label: definition.path.split('/').at(-1)!,
					definition,
					item: executions.get(path),
				});
				collections.add(path);
			}
		}
		const depth = row.depth + (definition ? collectionDepth(row.path) : 0);
		rows.push({ ...row, depth, definition });
		if (row.kind === 'step' && (definition?.kind === 'forEach' || definition?.kind === 'forEach-steps')) {
			for (const step of plan) {
				if (!step.path.startsWith(`${definition.path}/`)) { continue; }
				const relativePath = step.path.slice(definition.path.length + 1);
				rows.push({
					path: `${row.path}/${relativePath}`,
					depth: depth + relativePath.split('/').length,
					kind: 'step',
					label: relativePath.split('/').at(-1)!,
					definition: step,
				});
			}
		}
	}
	return rows;
}

function StepDetails({ row, plan }: { row: WorkflowStepRow; plan: WorkflowPlanStep[] }) {
	return (
		<div className="space-y-4 rounded-lg border bg-muted/20 p-4">
			<div className="font-mono text-xs break-all text-muted-foreground">{row.path}</div>
			{row.definition
				? (
					<dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
						<DetailRow label="Runs">{stepRuns(row.definition, plan)}</DetailRow>
						<DetailRow label="Kind">{row.definition.kind}{row.definition.parallel ? ' · parallel' : ''}</DetailRow>
						<DetailRow label="Undo">{row.definition.undo}</DetailRow>
						<DetailRow label="Max duration">{row.definition.maxDuration ?? '—'}</DetailRow>
					</dl>
				)
				: <p className="text-xs text-muted-foreground">This execution is not in the current plan.</p>}
			<dl className="grid grid-cols-2 gap-4 lg:hidden">
				<DetailRow label="Attempt">{row.item?.attempt ?? '—'}</DetailRow>
				<DetailRow label="Started">
					<Timestamp value={row.item?.startedAt} />
				</DetailRow>
				<DetailRow label="Finished">
					<Timestamp value={row.item?.finishedAt} />
				</DetailRow>
			</dl>
			{(row.definition?.pointOfNoReturn || row.item?.pointOfNoReturnAt) && (
				<div className="text-xs text-muted-foreground">
					<p className="font-medium">Point of no return</p>
					{row.item?.pointOfNoReturnAt
						? (
							<p>
								Reached <Timestamp value={row.item.pointOfNoReturnAt} />
							</p>
						)
						: <p>This step cannot be undone once applied.</p>}
				</div>
			)}
			{row.item?.error != null && (
				<div>
					<h3 className="text-xs font-medium">Error</h3>
					<JsonBlock value={row.item.error} label="Step error" />
				</div>
			)}
			{row.item?.receipt != null && (
				<div>
					<h3 className="text-xs font-medium">Receipt</h3>
					<JsonBlock value={row.item.receipt} label="Step receipt" />
				</div>
			)}
		</div>
	);
}

function StepsTable({ detail }: { detail: WorkflowDetail }) {
	const rows = useMemo(() =>
		workflowStepRows(detail).map((row) => ({
			...row,
			rowKey: `${row.definition ? 'plan' : 'execution'}:${row.path}`,
		})), [detail]);
	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
	const [expandedDetails, setExpandedDetails] = useState<Set<string>>(() => new Set());
	const toggle = (set: typeof setCollapsed, path: string) =>
		set((current) => {
			const next = new Set(current);
			if (next.has(path)) { next.delete(path); }
			else { next.add(path); }
			return next;
		});
	let hiddenDepth: number | undefined;
	const visibleRows = rows.map((row, index) => ({ ...row, hasChildren: (rows[index + 1]?.depth ?? -1) > row.depth }))
		.filter((row) => {
			if (hiddenDepth !== undefined && row.depth > hiddenDepth) { return false; }
			hiddenDepth = row.hasChildren && collapsed.has(row.rowKey) ? row.depth : undefined;
			return true;
		});
	if (!rows.length) { return <p className="text-sm text-muted-foreground">No steps are planned or recorded yet.</p>; }
	return (
		<div>
			<p className="mb-4 text-xs text-muted-foreground">
				Planned steps and recorded progress. Expand a row for its plan details, receipt, or error.
			</p>
			<Table aria-label="Workflow steps" className="[&_td]:px-3 [&_td]:py-3 [&_td]:align-top [&_th]:px-3">
				<TableHeader className="bg-muted/40">
					<TableRow>
						<TableHead>Step</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="hidden sm:table-cell">Attempt</TableHead>
						<TableHead className="hidden lg:table-cell">Started</TableHead>
						<TableHead className="hidden lg:table-cell">Finished</TableHead>
						<TableHead>
							<span className="sr-only">Details</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{visibleRows.map((row) => {
						const { path, depth, kind, label, position, item, definition, hasChildren, rowKey } = row;
						const open = expandedDetails.has(rowKey);
						const running = item?.status === 'running' && (detail.status === 'RUNNING' || detail.status === 'UNDOING');
						return (
							<Fragment key={rowKey}>
								<TableRow className={running ? 'workflow-step-running' : kind === 'group' ? 'bg-muted/30' : undefined}>
									<TableCell className="max-w-44 text-xs whitespace-normal sm:max-w-none" title={path}>
										<div className="flex items-start gap-2" style={{ paddingLeft: `${depth * 1.25}rem` }}>
											{hasChildren
												? (
													<button
														type="button"
														className="-m-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
														aria-expanded={!collapsed.has(rowKey)}
														aria-label={`${collapsed.has(rowKey) ? 'Expand' : 'Collapse'} ${label}`}
														onClick={() => toggle(setCollapsed, rowKey)}
													>
														{collapsed.has(rowKey)
															? <ChevronRightIcon className="size-4" />
															: <ChevronDownIcon className="size-4" />}
													</button>
												)
												: <span className="w-4 shrink-0" />}
											<div className="min-w-0">
												<span
													className={kind === 'group'
														? 'font-medium [overflow-wrap:anywhere]'
														: 'font-mono [overflow-wrap:anywhere]'}
												>
													{label}
												</span>
												{position && <span className="text-muted-foreground">{` · ${position}`}</span>}
												{kind === 'group' && /^batch\/[^/]+$/.test(path) && (
													<BatchInstances state={detail.state} batchId={path.split('/')[1]} />
												)}
												{!definition && <div className="mt-1 text-muted-foreground">Not in current plan</div>}
											</div>
										</div>
									</TableCell>
									<TableCell className="text-xs">
										{item
											? (
												<Badge
													variant={item.status === 'done'
														? 'success'
														: item.status === 'failed' || item.status === 'unknown'
														? 'destructive'
														: item.status === 'running'
														? 'warning'
														: 'outline'}
												>
													{running && (
														<Loader2Icon aria-hidden="true" className="size-3 shrink-0 motion-safe:animate-spin" />
													)}
													{item.status}
												</Badge>
											)
											: <span className="text-muted-foreground">not reached</span>}
									</TableCell>
									<TableCell className="hidden text-xs tabular-nums sm:table-cell">{item?.attempt ?? '—'}</TableCell>
									<TableCell className="hidden text-xs lg:table-cell">
										<Timestamp value={item?.startedAt} />
									</TableCell>
									<TableCell className="hidden text-xs lg:table-cell">
										<Timestamp value={item?.finishedAt} />
									</TableCell>
									<TableCell className="text-right text-xs">
										<button
											type="button"
											className="inline-flex items-center gap-1 rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
											aria-label={`${open ? 'Hide' : 'Show'} details for ${label}`}
											aria-expanded={open}
											onClick={() => toggle(setExpandedDetails, rowKey)}
										>
											{item?.error != null
												? <span className="hidden text-destructive sm:inline">Error</span>
												: <span className="hidden sm:inline">Details</span>}
											{open ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
										</button>
									</TableCell>
								</TableRow>
								{open && (
									<TableRow className="hover:bg-transparent">
										<TableCell colSpan={6} className="whitespace-normal">
											<StepDetails row={row} plan={detail.plan ?? []} />
										</TableCell>
									</TableRow>
								)}
							</Fragment>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}

function EventsTable({ detail }: { detail: WorkflowDetail }) {
	const events = useMemo(() => [...detail.events].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)), [
		detail.events,
	]);
	if (!events.length) { return <p className="text-sm text-muted-foreground">No events yet.</p>; }
	return (
		<div className="overflow-x-auto">
			<Table className="[&_td]:px-3 [&_td]:py-3 [&_td]:align-top [&_th]:px-3">
				<TableHeader className="bg-muted/40">
					<TableRow>
						<TableHead>At</TableHead>
						<TableHead>Event</TableHead>
						<TableHead>Step</TableHead>
						<TableHead>Data</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{events.map((event) => (
						<TableRow key={event.id}>
							<TableCell className="whitespace-nowrap text-xs">
								<Timestamp value={event.at} />
							</TableCell>
							<TableCell className="text-xs">
								{event.kind}
								{event.attempt != null && <span className="text-muted-foreground">{` (attempt ${event.attempt})`}
								</span>}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{[event.step, event.item].filter(Boolean).join(' · ') || '—'}
							</TableCell>
							<TableCell className="max-w-md text-xs">
								<Collapsible summary="data" value={event.data} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function WorkflowDetailView({ detail, readAt }: { detail: WorkflowDetail; readAt: number }) {
	const progress = batchProgress(detail);
	const clusters = heldClusterIds(detail);
	return (
		<div>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-2xl font-semibold tracking-tight">{workflowTypeLabel(detail.type)}</h1>
					<p className="mt-1 font-mono text-sm break-all text-muted-foreground">{detail.id}</p>
					<div className="mt-2">
						<WorkflowStatusBadge row={detail} />
					</div>
				</div>
				<WorkflowCommands detail={detail} readAt={readAt} />
			</div>

			{!detail.definitionRegistered && (
				<p className="mt-4 text-sm text-destructive">
					Central manager has no definition registered for {detail.type}, so this workflow can only be abandoned.
				</p>
			)}

			<dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 rounded-xl border bg-card/70 p-5 shadow-sm sm:grid-cols-2 xl:grid-cols-3">
				<DetailRow label="Phase">{detail.phase ?? '—'}</DetailRow>
				<DetailRow label="Step">
					{describeStep(detail) ?? '—'}
					{detail.stepAttempt
						? <span className="text-muted-foreground">{` (attempt ${detail.stepAttempt})`}</span>
						: null}
					{detail.step && <div className="font-mono text-xs text-muted-foreground">{detail.step}</div>}
				</DetailRow>
				{progress && (
					<DetailRow label="Batches">
						{progress.finished} of {progress.total} finished
						{progress.currentId && `, on ${progress.currentId}`}
						{progress.currentId && <BatchInstances state={detail.state} batchId={progress.currentId} />}
					</DetailRow>
				)}
				{detail.status === 'PAUSED' && <DetailRow label="Paused">{pauseLabel(detail.pause?.reason)}</DetailRow>}
				{detail.command?.action && (
					<DetailRow label="Pending command">
						{detail.command.action}
						{detail.command.by && ` by ${detail.command.by}`}, waiting for the next step boundary
					</DetailRow>
				)}
				{(detail.failedStep || detail.failedItem) && (
					<DetailRow label="Failed at">
						<span className="font-mono">{[detail.failedStep, detail.failedItem].filter(Boolean).join(' · ')}</span>
					</DetailRow>
				)}
				{detail.undoStep && <DetailRow label="Undoing">{detail.undoStep}</DetailRow>}
				<DetailRow label="Step started">
					<Timestamp value={detail.stepStartedAt} />
				</DetailRow>
				{detail.stepDeadlineAt && (
					<DetailRow label="Step deadline">
						<Timestamp value={detail.stepDeadlineAt} />
					</DetailRow>
				)}
				<DetailRow label="Point of no return">
					<Timestamp value={detail.pointOfNoReturnAt} />
				</DetailRow>
				<DetailRow label={clusters.length > 1 ? 'Clusters' : 'Cluster'}>
					{clusters.length
						? (
							<span className="flex flex-col gap-0.5 font-mono">
								{clusters.map((id) => <span key={id}>{id}</span>)}
							</span>
						)
						: '—'}
				</DetailRow>
				{detail.scope && !detail.scope.startsWith('cluster:') && (
					<DetailRow label="Scope">
						<span className="font-mono">{detail.scope}</span>
					</DetailRow>
				)}
				{detail.parentId && (
					<DetailRow label="Parent">
						<Link
							to="/admin/workflows/$workflowId"
							params={{ workflowId: detail.parentId }}
							className="font-mono underline underline-offset-2"
						>
							{detail.parentId}
						</Link>
					</DetailRow>
				)}
				<DetailRow label="Owner">
					{detail.owner?.node ?? '—'}
					{detail.leaseExpiresAt && (
						<span className="text-muted-foreground">
							{' '}lease until <Timestamp value={detail.leaseExpiresAt} />
						</span>
					)}
				</DetailRow>
				<DetailRow label="Started by">
					<span className="font-mono">{detail.createdByUserId ?? '—'}</span>
				</DetailRow>
				<DetailRow label="Created">
					<Timestamp value={detail.createdAt} />
				</DetailRow>
				<DetailRow label="Updated">
					<Timestamp value={detail.updatedAt} />
				</DetailRow>
				{detail.endedAt && (
					<DetailRow label="Ended">
						<Timestamp value={detail.endedAt} />
					</DetailRow>
				)}
			</dl>

			{(detail.error != null || detail.failure != null) && (
				<Section title="Error">
					<JsonBlock value={detail.error} label="error" />
					{detail.failure != null && (
						<div className="mt-2">
							<Collapsible summary="failure" value={detail.failure} />
						</div>
					)}
				</Section>
			)}

			<Section title="Input and state">
				<Collapsible summary="input" value={detail.input} />
				<Collapsible summary="state" value={detail.state} />
			</Section>

			<Section title="Steps">
				<StepsTable detail={detail} />
			</Section>

			{detail.children.length > 0 && (
				<Section title="Child workflows">
					<ul className="flex flex-col gap-1 text-sm">
						{detail.children.map((child) => (
							<li key={child.id} className="flex flex-wrap items-center gap-2">
								<Link
									to="/admin/workflows/$workflowId"
									params={{ workflowId: child.id }}
									className="font-mono underline underline-offset-2"
								>
									{child.id}
								</Link>
								<WorkflowStatusBadge row={child} />
								{child.step && <span className="font-mono text-xs text-muted-foreground">{child.step}</span>}
							</li>
						))}
					</ul>
				</Section>
			)}

			<Section title="Events">
				<EventsTable detail={detail} />
			</Section>
		</div>
	);
}

export function WorkflowDetailPage() {
	const { workflowId } = useParams({ strict: false }) as { workflowId: string };
	const { data, isLoading, error, dataUpdatedAt } = useQuery(workflowDetailQueryOptions(workflowId));
	const notFound = error instanceof AxiosError && error.response?.status === 404;
	return (
		<div>
			<Link
				to="/admin/workflows"
				className="mb-5 inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
			>
				<ArrowLeftIcon className="size-4" /> Workflows
			</Link>
			{data && data.id === workflowId
				? (
					<>
						{!!error && <RefreshFailed error={error} />}
						<WorkflowDetailView key={workflowId} detail={data} readAt={dataUpdatedAt} />
					</>
				)
				: isLoading
				? <p className="text-sm text-muted-foreground">Loading workflow…</p>
				: notFound
				? <p className="text-sm text-muted-foreground">No workflow has the id {workflowId}.</p>
				: <p className="text-sm text-destructive">Couldn't load this workflow.</p>}
		</div>
	);
}
