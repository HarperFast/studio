import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
	DetailRow,
	JsonBlock,
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
	pauseLabel,
	StatusCounts,
	statusCountsByStep,
	workflowTypeLabel,
} from '@/features/admin/workflows/workflowProgress';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { AxiosError } from 'axios';
import { ArrowLeftIcon } from 'lucide-react';
import { ReactNode, useMemo } from 'react';

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="mt-8">
			<h2 className="mb-2 text-lg font-light">{title}</h2>
			{children}
		</section>
	);
}

function Collapsible({ summary, value }: { summary: string; value: unknown }) {
	if (value === undefined || value === null) { return null; }
	return (
		<details>
			<summary className="cursor-pointer text-xs text-muted-foreground">{summary}</summary>
			<JsonBlock value={value} label={summary} />
		</details>
	);
}

const COUNT_ORDER = ['done', 'running', 'failed', 'unknown', 'pending', 'skipped', 'undone'];

function StepProgress({ counts }: { counts: StatusCounts | undefined }) {
	if (!counts) { return <span className="text-muted-foreground">not reached</span>; }
	const entries = Object.entries(counts).sort(([a], [b]) => COUNT_ORDER.indexOf(a) - COUNT_ORDER.indexOf(b));
	return (
		<span className="flex flex-wrap gap-1">
			{entries.map(([status, count]) => (
				<Badge
					key={status}
					variant={status === 'done'
						? 'success'
						: status === 'failed' || status === 'unknown'
						? 'destructive'
						: status === 'running'
						? 'warning'
						: 'outline'}
				>
					{count} {status}
				</Badge>
			))}
		</span>
	);
}

function PlanTable({ plan, counts }: { plan: WorkflowPlanStep[]; counts: Map<string, StatusCounts> }) {
	return (
		<div className="overflow-x-auto">
			<Table className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:px-3">
				<TableHeader>
					<TableRow>
						<TableHead>Step</TableHead>
						<TableHead>Kind</TableHead>
						<TableHead>Undo</TableHead>
						<TableHead>Max duration</TableHead>
						<TableHead>Progress</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{plan.map((step) => {
						const depth = step.path.split('/').length - 1;
						return (
							<TableRow key={step.path}>
								<TableCell className="font-mono text-xs">
									<span style={{ paddingLeft: `${depth * 1.25}rem` }}>{step.path.split('/').at(-1)}</span>
									{step.pointOfNoReturn && (
										<Badge variant="warning" className="ml-2" title="Cannot be undone once done">
											point of no return
										</Badge>
									)}
								</TableCell>
								<TableCell className="text-xs">{step.kind}{step.parallel ? ' · parallel' : ''}</TableCell>
								<TableCell className="text-xs">{step.undo}</TableCell>
								<TableCell className="text-xs">{step.maxDuration ?? '—'}</TableCell>
								<TableCell className="text-xs">
									<StepProgress counts={counts.get(step.path)} />
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}

function ItemsTable({ detail }: { detail: WorkflowDetail }) {
	const items = useMemo(
		() => [...detail.items].sort((a, b) => a.stepPath.localeCompare(b.stepPath, undefined, { numeric: true })),
		[detail.items],
	);
	if (!items.length) { return <p className="text-sm text-muted-foreground">No step has run yet.</p>; }
	return (
		<div className="overflow-x-auto">
			<Table className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:px-3">
				<TableHeader>
					<TableRow>
						<TableHead>Path</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Attempt</TableHead>
						<TableHead>Started</TableHead>
						<TableHead>Finished</TableHead>
						<TableHead>Receipt / error</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((item) => (
						<TableRow key={item.id}>
							<TableCell className="font-mono text-xs">
								{item.stepPath}
								{item.pointOfNoReturnAt && (
									<div className="text-muted-foreground">
										point of no return <Timestamp value={item.pointOfNoReturnAt} />
									</div>
								)}
							</TableCell>
							<TableCell className="text-xs">{item.status}</TableCell>
							<TableCell className="text-xs">{item.attempt ?? '—'}</TableCell>
							<TableCell className="text-xs">
								<Timestamp value={item.startedAt} />
							</TableCell>
							<TableCell className="text-xs">
								<Timestamp value={item.finishedAt} />
							</TableCell>
							<TableCell className="max-w-md text-xs">
								<Collapsible summary="error" value={item.error} />
								<Collapsible summary="receipt" value={item.receipt} />
							</TableCell>
						</TableRow>
					))}
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
			<Table className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:px-3">
				<TableHeader>
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
								{event.attempt != null && <span className="text-muted-foreground">(attempt {event.attempt})</span>}
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

export function WorkflowDetailView({ detail }: { detail: WorkflowDetail }) {
	const counts = useMemo(() => statusCountsByStep(detail), [detail]);
	const progress = batchProgress(detail);
	return (
		<div>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-2xl font-light">{workflowTypeLabel(detail.type)}</h1>
					<p className="mt-1 font-mono text-sm break-all text-muted-foreground">{detail.id}</p>
					<div className="mt-2">
						<WorkflowStatusBadge row={detail} />
					</div>
				</div>
				<WorkflowCommands detail={detail} />
			</div>

			{!detail.definitionRegistered && (
				<p className="mt-4 text-sm text-destructive">
					Central manager has no definition registered for {detail.type}, so this workflow can only be abandoned.
				</p>
			)}

			<dl className="mt-6 flex flex-col gap-2">
				<DetailRow label="Phase">{detail.phase ?? '—'}</DetailRow>
				<DetailRow label="Step">
					<span className="font-mono">{detail.step ?? '—'}</span>
					{detail.stepAttempt ? <span className="text-muted-foreground">(attempt {detail.stepAttempt})</span> : null}
				</DetailRow>
				{progress && (
					<DetailRow label="Batches">
						{progress.finished} of {progress.total} finished
						{progress.currentId && `, on ${progress.currentId}`}
					</DetailRow>
				)}
				{detail.status === 'PAUSED' && <DetailRow label="Paused">{pauseLabel(detail.pause?.reason)}</DetailRow>}
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
				<DetailRow label="Cluster">
					<span className="font-mono">{detail.clusterId ?? '—'}</span>
				</DetailRow>
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

			<Section title="Plan">
				{detail.plan
					? <PlanTable plan={detail.plan} counts={counts} />
					: <p className="text-sm text-muted-foreground">No plan: the definition is not registered.</p>}
			</Section>

			<Section title="Items">
				<ItemsTable detail={detail} />
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

			<Section title="Input and state">
				<Collapsible summary="input" value={detail.input} />
				<Collapsible summary="state" value={detail.state} />
			</Section>

			<Section title="Events">
				<EventsTable detail={detail} />
			</Section>
		</div>
	);
}

export function WorkflowDetailPage() {
	const { workflowId } = useParams({ strict: false }) as { workflowId: string };
	const { data, isLoading, error } = useQuery(workflowDetailQueryOptions(workflowId));
	const notFound = error instanceof AxiosError && error.response?.status === 404;
	return (
		<div>
			<Link to="/admin/workflows" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
				<ArrowLeftIcon className="size-4" /> Workflows
			</Link>
			{isLoading
				? <p className="text-sm text-muted-foreground">Loading workflow…</p>
				: notFound
				? <p className="text-sm text-muted-foreground">No workflow has the id {workflowId}.</p>
				: error || !data
				? <p className="text-sm text-destructive">Couldn't load this workflow.</p>
				: <WorkflowDetailView detail={data} />}
		</div>
	);
}
