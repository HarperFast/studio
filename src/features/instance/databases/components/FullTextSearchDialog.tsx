/**
 * The database browser's full-text search tester: pick one of the table's full-text indexes, a query
 * mode and optionally which of its sources to search, then run the query through
 * `search_by_conditions` and see each hit ranked, with its score and highlighted matches.
 *
 * It also shows the index's readiness from `describe_table`. Each node builds and keeps its own
 * index, so on a cluster the tester says which node it heard from. A search Harper refuses — say,
 * while the index rebuilds — shows Harper's own message inline: in a tester that is the answer, so
 * it is neither toasted nor reported as a Studio error.
 */
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { HighlightedExcerpt, highlightedExcerpts } from '@/features/instance/databases/functions/fullTextHighlights';
import { FullTextIndexDescription } from '@/integrations/api/api.patch';
import {
	FullTextComparator,
	FullTextHit,
	searchFullText,
	supportedQueryModes,
} from '@/integrations/api/instance/database/searchFullText';
import { getAnsweringNodeNameQueryOptions } from '@/integrations/api/instance/status/getAnsweringNodeName';
import { describeError } from '@/react-query/queryClient';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { RefreshCwIcon, SearchIcon, TriangleAlertIcon } from 'lucide-react';
import { FormEvent, useId, useState } from 'react';

const RESULT_LIMITS = [10, 20, 50, 100];

const READINESS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
	ready: { label: 'Ready', variant: 'success' },
	rebuilding: { label: 'Rebuilding', variant: 'warning' },
	'needs-rebuild': { label: 'Needs rebuild', variant: 'warning' },
	unavailable: { label: 'Unavailable', variant: 'destructive' },
	unknown: { label: 'Unknown', variant: 'secondary' },
};

export function FullTextSearchDialog({
	open,
	onOpenChange,
	databaseName,
	tableName,
	primaryKey,
	indexes,
	isCluster,
	isRefreshing,
	onRefresh,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	databaseName: string;
	tableName: string;
	primaryKey: string | undefined;
	/** The table's `full_text_indexes` from `describe_table`; the tester is only offered when there is one. */
	indexes: FullTextIndexDescription[];
	/** On a cluster each node has its own index, so readiness is said to be one node's. */
	isCluster: boolean;
	isRefreshing: boolean;
	/** Read `describe_table` again, for fresh readiness. */
	onRefresh: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="lg:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Full-text search</DialogTitle>
					<DialogDescription>
						Try a query against a full-text index on <code>{tableName}</code>.
					</DialogDescription>
				</DialogHeader>
				{/* Mounted only while open, so each opening starts from the table's current indexes. */}
				{open && indexes.length > 0 && (
					<SearchTester
						databaseName={databaseName}
						tableName={tableName}
						primaryKey={primaryKey}
						indexes={indexes}
						isCluster={isCluster}
						isRefreshing={isRefreshing}
						onRefresh={onRefresh}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function SearchTester({
	databaseName,
	tableName,
	primaryKey,
	indexes,
	isCluster,
	isRefreshing,
	onRefresh,
}: {
	databaseName: string;
	tableName: string;
	primaryKey: string | undefined;
	indexes: FullTextIndexDescription[];
	isCluster: boolean;
	isRefreshing: boolean;
	onRefresh: () => void;
}) {
	const instanceParams = useInstanceClientIdParams();
	const ids = { index: useId(), mode: useId(), query: useId(), limit: useId(), wait: useId() };

	const [indexName, setIndexName] = useState(indexes[0].name);
	const index = indexes.find(candidate => candidate.name === indexName) ?? indexes[0];
	const modes = supportedQueryModes(index);
	const [chosenComparator, setComparator] = useState<FullTextComparator>('matches');
	const comparator = modes.some(mode => mode.comparator === chosenComparator) ? chosenComparator : 'matches';
	const mode = modes.find(candidate => candidate.comparator === comparator);
	// Empty means every source. Kept per index so switching back restores the choice. A Map, so an index
	// named like an `Object.prototype` member is never found by mistake.
	const [chosenFields, setChosenFields] = useState<ReadonlyMap<string, string[]>>(() => new Map());
	const fields = (chosenFields.get(index.name) ?? []).filter(name => index.fields.some(source => source.name === name));
	const [query, setQuery] = useState('');
	const [waitForRecentWrites, setWaitForRecentWrites] = useState(false);
	const [limit, setLimit] = useState(20);

	// Read afresh with every readiness check, so the name labels the reading beside it.
	const { data: nodeName, refetch: refetchNodeName } = useQuery({
		...getAnsweringNodeNameQueryOptions(instanceParams),
		enabled: isCluster,
		staleTime: 0,
	});
	const checkAgain = () => {
		onRefresh();
		if (isCluster) {
			void refetchNodeName();
		}
	};

	const search = useMutation({
		mutationFn: searchFullText,
		meta: { skipGlobalErrorToast: true },
		onError: (error) => {
			// Harper refusing the search (a 4xx, or 503 while the index rebuilds) is what a tester is for, so it
			// stays out of RUM; a failure with no answer at all is reported as any other failure would be.
			if (isAxiosError(error) && error.response) {
				console.debug('Full-text search refused', error);
			} else {
				console.error(error);
			}
		},
	});

	const toggleField = (name: string, on: boolean) => {
		const current = fields.length === 0 ? index.fields.map(source => source.name) : fields;
		const next = on ? [...current, name] : current.filter(field => field !== name);
		// Every source, or none, both mean "search them all".
		const all = next.length === index.fields.length || next.length === 0;
		setChosenFields(
			new Map(chosenFields).set(
				index.name,
				all ? [] : index.fields.map(source => source.name).filter(n => next.includes(n)),
			),
		);
	};

	const chooseIndex = (name: string) => {
		setIndexName(name);
		// The results were found in the other index; under this one's readiness they'd mislead.
		search.reset();
	};

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (!query.trim()) {
			return;
		}
		search.mutate({
			instanceClient: instanceParams.instanceClient,
			databaseName,
			tableName,
			index,
			comparator,
			query,
			fields,
			waitForRecentWrites,
			limit,
		});
	};

	const readiness = Object.hasOwn(READINESS, index.readiness.state)
		? READINESS[index.readiness.state]
		: { label: index.readiness.state, variant: 'secondary' as const };

	return (
		<div className="flex min-w-0 flex-col gap-4">
			<section aria-label="Index readiness" className="flex flex-col gap-1 rounded-md border p-3 text-sm">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium">{index.name}</span>
					<Badge variant={readiness.variant}>{readiness.label}</Badge>
					{index.readiness.reason && <span className="text-muted-foreground">{index.readiness.reason}</span>}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="ml-auto"
						onClick={checkAgain}
						disabled={isRefreshing}
					>
						<RefreshCwIcon className={isRefreshing ? 'animate-spin' : undefined} /> Check again
					</Button>
				</div>
				{index.readiness.state !== 'ready' && (
					<p className="text-xs text-muted-foreground">
						Searches can fail until the index is ready.
						{index.readiness.rebuild_attempts > 0
							&& ` Rebuild attempts so far: ${index.readiness.rebuild_attempts}.`}
					</p>
				)}
				{isCluster && (
					<p className="text-xs text-muted-foreground">
						{nodeName
							? (
								<>
									As reported by node <code>{nodeName}</code>.
								</>
							)
							: 'As reported by the node that answered.'} Each node builds its own index, so another node’s can differ.
					</p>
				)}
			</section>

			<form onSubmit={onSubmit} className="flex flex-col gap-3">
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					{indexes.length > 1 && (
						<div className="flex flex-col gap-1">
							<Label htmlFor={ids.index} className="text-xs text-muted-foreground">Index</Label>
							<Select value={index.name} onValueChange={chooseIndex}>
								<SelectTrigger id={ids.index} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{indexes.map(candidate => (
										<SelectItem key={candidate.name} value={candidate.name}>{candidate.name}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					<div className="flex flex-col gap-1">
						<Label htmlFor={ids.mode} className="text-xs text-muted-foreground">Query mode</Label>
						<Select value={comparator} onValueChange={value => setComparator(value as FullTextComparator)}>
							<SelectTrigger id={ids.mode} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{modes.map(candidate => (
									<SelectItem key={candidate.comparator} value={candidate.comparator}>
										{candidate.label} <span className="text-muted-foreground">({candidate.comparator})</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{mode && <span className="text-xs text-muted-foreground">{mode.description}</span>}
					</div>
				</div>

				{index.fields.length > 1 && (
					<fieldset className="flex flex-col gap-1">
						<legend className="text-xs text-muted-foreground">Search in</legend>
						<div className="flex flex-wrap gap-x-4 gap-y-1">
							{index.fields.map(source => (
								<label key={source.name} className="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={fields.length === 0 || fields.includes(source.name)}
										// Searching nothing isn't a search, so the last source stays checked.
										disabled={fields.length === 1 && fields[0] === source.name}
										onChange={event => toggleField(source.name, event.target.checked)}
									/>
									{source.name}
									{source.weight !== 1 && <span className="text-xs text-muted-foreground">×{source.weight}</span>}
								</label>
							))}
						</div>
					</fieldset>
				)}

				<div className="flex flex-col gap-1">
					<Label htmlFor={ids.query} className="text-xs text-muted-foreground">Query</Label>
					<div className="flex gap-2">
						<Input
							id={ids.query}
							type="search"
							value={query}
							placeholder="e.g. trail running"
							autoComplete="off"
							onChange={event => setQuery(event.target.value)}
						/>
						<Button type="submit" disabled={!query.trim() || search.isPending}>
							<SearchIcon /> Search
						</Button>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-x-6 gap-y-2">
					<div className="flex items-center gap-2">
						<Switch id={ids.wait} checked={waitForRecentWrites} onCheckedChange={setWaitForRecentWrites} />
						<Label htmlFor={ids.wait} className="font-normal">
							Wait for recent writes
							<span className="ml-1 text-xs text-muted-foreground">
								otherwise the index can trail writes by a few seconds
							</span>
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<Label htmlFor={ids.limit} className="font-normal">Show up to</Label>
						<Select value={String(limit)} onValueChange={value => setLimit(Number(value))}>
							<SelectTrigger id={ids.limit} className="w-20">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{RESULT_LIMITS.map(option => <SelectItem key={option} value={String(option)}>{option}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
				</div>
			</form>

			{search.isError && (
				<Alert variant="destructive">
					<TriangleAlertIcon />
					<AlertTitle>
						{isAxiosError(search.error) && search.error.response
							? 'Harper refused the search'
							: 'The search got no answer'}
					</AlertTitle>
					<AlertDescription>{describeError(search.error).message}</AlertDescription>
				</Alert>
			)}

			{/* Only for the index on screen: one a refresh dropped falls back to another without a reset. */}
			{search.isSuccess && search.variables.index.name === index.name && (
				<SearchResults
					hits={search.data}
					index={search.variables.index}
					primaryKey={primaryKey}
					limit={search.variables.limit}
				/>
			)}
		</div>
	);
}

function SearchResults({ hits, index, primaryKey, limit }: {
	hits: FullTextHit[];
	index: FullTextIndexDescription;
	primaryKey: string | undefined;
	limit: number;
}) {
	if (hits.length === 0) {
		return <p className="text-sm text-muted-foreground">No records match.</p>;
	}
	return (
		<section aria-label="Results" className="flex flex-col gap-2">
			<p className="text-xs text-muted-foreground">
				{hits.length === limit
					? `The top ${hits.length} matches, best first. There may be more.`
					: `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}, best first.`}
			</p>
			<ol className="flex flex-col gap-2">
				{hits.map((hit, rank) => (
					<SearchHit
						key={primaryKey && Object.hasOwn(hit, primaryKey) ? String(hit[primaryKey]) : rank}
						hit={hit}
						rank={rank + 1}
						index={index}
						primaryKey={primaryKey}
					/>
				))}
			</ol>
		</section>
	);
}

function SearchHit({ hit, rank, index, primaryKey }: {
	hit: FullTextHit;
	rank: number;
	index: FullTextIndexDescription;
	primaryKey: string | undefined;
}) {
	const highlights = hit.$highlights ?? {};
	const sources = index.fields.map(source => ({
		name: source.name,
		excerpts: Object.hasOwn(highlights, source.name)
			? highlights[source.name].flatMap(entry => highlightedExcerpts(hit[source.name], entry))
			: [],
	}));
	const highlighted = sources.filter(source => source.excerpts.length > 0);
	return (
		<li className="flex flex-col gap-1 rounded-md border p-3 text-sm">
			<div className="flex flex-wrap items-baseline gap-x-3">
				<span className="text-muted-foreground">#{rank}</span>
				<span className="font-medium break-all">
					{primaryKey && Object.hasOwn(hit, primaryKey) ? String(hit[primaryKey]) : 'Record'}
				</span>
				{typeof hit.$score === 'number' && (
					<span className="ml-auto text-xs text-muted-foreground">score {formatScore(hit.$score)}</span>
				)}
			</div>
			{highlighted.length > 0
				? (
					<dl className="flex flex-col gap-1">
						{highlighted.map(source => (
							<div key={source.name} className="flex flex-col">
								<dt className="text-xs text-muted-foreground">{source.name}</dt>
								{source.excerpts.map((excerpt, i) => (
									<dd key={i} className="break-words">
										<Excerpt excerpt={excerpt} />
									</dd>
								))}
							</div>
						))}
					</dl>
				)
				: <Preview hit={hit} index={index} />}
		</li>
	);
}

function Excerpt({ excerpt }: { excerpt: HighlightedExcerpt }) {
	return (
		<>
			{excerpt.leadingEllipsis && '…'}
			{excerpt.segments.map((segment, i) =>
				segment.match
					? <mark key={i} className="rounded-sm bg-yellow/50 px-0.5 text-foreground">{segment.text}</mark>
					: <span key={i}>{segment.text}</span>
			)}
			{excerpt.trailingEllipsis && '…'}
		</>
	);
}

/**
 * The first text source with a value, for a hit with nothing highlighted: the index doesn't
 * highlight, or the match was in a source that doesn't.
 */
function Preview({ hit, index }: { hit: FullTextHit; index: FullTextIndexDescription }) {
	for (const source of index.fields) {
		const value = hit[source.name];
		const text = typeof value === 'string'
			? value
			: Array.isArray(value) && value.every(item => typeof item === 'string')
			? value.join(', ')
			: undefined;
		if (text) {
			return (
				<p className="break-words text-muted-foreground">
					<span className="text-xs">{source.name}:</span> {text.length > 240 ? `${text.slice(0, 240)}…` : text}
				</p>
			);
		}
	}
	return null;
}

function formatScore(score: number): string {
	return score.toLocaleString(undefined, { maximumFractionDigits: 3 });
}
