import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { reportSearchFailure, SearchFailureAlert } from '@/features/instance/databases/components/SearchFailureAlert';
import {
	formatNumber,
	previewAttributes,
	SimilarRecordsSeed,
	textSearchableVectors,
	VectorAttribute,
} from '@/features/instance/databases/functions/vectorAttributes';
import { InstanceTable } from '@/integrations/api/api.patch';
import {
	NearestRecord,
	NearestRecordsParams,
	searchNearestRecords,
} from '@/integrations/api/instance/database/searchNearestRecords';
import { useMutation } from '@tanstack/react-query';
import { SearchIcon } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';

const RESULT_LIMITS = [10, 20, 50, 100];
const PREVIEW_LENGTH = 200;

export type VectorSearchRequest = { kind: 'record'; seed: SimilarRecordsSeed } | { kind: 'text' };

/**
 * A search by text, held by the dialog rather than its contents, which unmount when it closes: closing and
 * reopening it mid-search keeps the search in flight on screen, and its guard against a second model call.
 */
function useTextSearch() {
	// Set before `mutate` and cleared when it settles, so a second Enter or click before React re-renders
	// starts no second model call.
	const inFlight = useRef(false);
	const search = useMutation({
		// `vector` rides along so the results can be checked against the field as describe now reports it.
		mutationFn: ({ params }: { params: NearestRecordsParams; vector: VectorAttribute }) => searchNearestRecords(params),
		meta: { skipGlobalErrorToast: true },
		onError: reportSearchFailure,
		onSettled: () => {
			inFlight.current = false;
		},
	});
	const [text, setText] = useState('');
	const [attributeName, setAttributeName] = useState<string>();
	const [limit, setLimit] = useState(20);
	return { search, inFlight, text, setText, attributeName, setAttributeName, limit, setLimit };
}

type TextSearchState = ReturnType<typeof useTextSearch>;

export function SimilarRecordsDialog({
	request,
	onClose,
	databaseName,
	tableName,
	table,
	primaryKey,
	vectors,
}: {
	request: VectorSearchRequest | undefined;
	onClose: () => void;
	databaseName: string;
	tableName: string;
	table: InstanceTable;
	primaryKey: string;
	vectors: VectorAttribute[];
}) {
	const textSearch = useTextSearch();
	const seed = request?.kind === 'record' ? request.seed : undefined;
	const recordVectors = seed ? vectors.filter(vector => seed.vectors.has(vector.attribute)) : [];
	const textVectors = request?.kind === 'text' ? textSearchableVectors(vectors) : [];
	const shared = { databaseName, tableName, table, primaryKey };
	return (
		<Dialog open={!!request} onOpenChange={open => !open && onClose()}>
			<DialogContent className="lg:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{request?.kind === 'text' ? 'Vector search' : 'Similar records'}</DialogTitle>
					<DialogDescription>
						{request?.kind === 'text'
							? (
								<>
									The records in <code>{tableName}</code> whose vector is nearest the meaning of your text.
								</>
							)
							: (
								<>
									The records in <code>{tableName}</code> whose stored vector is nearest this one’s.
								</>
							)}
					</DialogDescription>
				</DialogHeader>
				{/* Mounted only while open, and anew for each record, so a search is always from the record shown. */}
				{seed && recordVectors.length > 0 && (
					<RecordSearch key={JSON.stringify(seed.key)} {...shared} vectors={recordVectors} seed={seed} />
				)}
				{textVectors.length > 0 && <TextSearch {...shared} vectors={textVectors} state={textSearch} />}
			</DialogContent>
		</Dialog>
	);
}

interface SearchProps {
	databaseName: string;
	tableName: string;
	table: InstanceTable;
	primaryKey: string;
	vectors: VectorAttribute[];
}

function RecordSearch({ databaseName, tableName, table, primaryKey, vectors, seed }: SearchProps & {
	seed: SimilarRecordsSeed;
}) {
	const { instanceClient } = useInstanceClientIdParams();
	const [attributeName, setAttributeName] = useState(vectors[0].attribute);
	const vector = vectors.find(candidate => candidate.attribute === attributeName) ?? vectors[0];
	const [limit, setLimit] = useState(20);
	const preview = previewAttributes(table, primaryKey, vector);

	const search = useMutation({
		mutationFn: async (params: NearestRecordsParams) => {
			// One more than shown, for the seed, which is its own nearest neighbour.
			const hits = await searchNearestRecords({ ...params, limit: params.limit + 1 });
			return hits.filter(hit => !sameKey(hit[primaryKey], seed.key)).slice(0, params.limit);
		},
		meta: { skipGlobalErrorToast: true },
		onError: reportSearchFailure,
	});
	const { mutate } = search;
	const target = seed.vectors.get(vector.attribute)!;
	const searchKey = JSON.stringify([vector.attribute, limit]);
	useEffect(() => {
		mutate({
			instanceClient,
			databaseName,
			tableName,
			primaryKey,
			attribute: vector.attribute,
			query: { target },
			previewAttributes: preview,
			limit,
		});
		// `searchKey` holds what a new search depends on; the rest is fixed while this is mounted.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchKey]);

	const current = search.variables?.attribute === vector.attribute && search.variables.limit === limit;

	return (
		<div className="flex min-w-0 flex-col gap-4">
			<SearchControls
				vectors={vectors}
				vector={vector}
				onVectorChange={setAttributeName}
				limit={limit}
				onLimitChange={setLimit}
			/>
			<p className="text-xs text-muted-foreground">
				Nearest <code>{formatKey(seed.key)}</code> by <code>{vector.attribute}</code>, using {vector.distance}{' '}
				distance: lower is closer.
			</p>
			{current && search.isPending && <p className="text-sm text-muted-foreground">Searching…</p>}
			{current && search.isError && <SearchFailureAlert error={search.error} />}
			{current && search.isSuccess && (
				<Results hits={search.data} limit={limit} primaryKey={primaryKey} preview={preview}>
					No other record has this vector.
				</Results>
			)}
		</div>
	);
}

function TextSearch({ databaseName, tableName, table, primaryKey, vectors, state }: SearchProps & {
	state: TextSearchState;
}) {
	const { search, inFlight, text, setText, attributeName, setAttributeName, limit, setLimit } = state;
	const { instanceClient } = useInstanceClientIdParams();
	const queryId = useId();
	const vector = vectors.find(candidate => candidate.attribute === attributeName) ?? vectors[0];
	const preview = previewAttributes(table, primaryKey, vector);
	const query = text.trim();

	// Every search by text calls the field's model, so only a submit runs one: never opening, typing, or a
	// change of field or limit.
	const onSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (!query || inFlight.current) {
			return;
		}
		inFlight.current = true;
		search.mutate({
			params: {
				instanceClient,
				databaseName,
				tableName,
				primaryKey,
				attribute: vector.attribute,
				query: { text: query },
				previewAttributes: preview,
				limit,
			},
			vector,
		});
	};

	const searched = search.variables?.params;
	// Results ranked by another field, or by this one before a schema refresh changed its model, source or
	// distance, are never shown.
	const sameField = !!search.variables && sameVector(search.variables.vector, vector);
	const edited = !!searched && (searched.query.text !== query || searched.limit !== limit);
	const editedNote = edited && (
		<span className="block">These are for your last search. Search again to see results for your changes.</span>
	);

	return (
		<div className="flex min-w-0 flex-col gap-4">
			<form onSubmit={onSubmit} className="flex flex-col gap-3">
				<SearchControls
					vectors={vectors}
					vector={vector}
					onVectorChange={setAttributeName}
					vectorDisabled={search.isPending}
					limit={limit}
					onLimitChange={setLimit}
				/>
				<div className="flex flex-col gap-1">
					<Label htmlFor={queryId} className="text-xs text-muted-foreground">Text</Label>
					<div className="flex gap-2">
						<Input
							id={queryId}
							type="search"
							value={text}
							placeholder="e.g. caring for a new kitten"
							autoComplete="off"
							onChange={event => setText(event.target.value)}
						/>
						<Button type="submit" disabled={!query || search.isPending}>
							<SearchIcon /> Search
						</Button>
					</div>
					<span className="text-xs text-muted-foreground">
						Harper embeds the text with {modelName(vector)} as a search query, and ranks by {vector.distance}{' '}
						distance: lower is closer. Each search calls the model.
					</span>
				</div>
			</form>

			{sameField && search.isPending && <p className="text-sm text-muted-foreground">Searching…</p>}
			{sameField && search.isError && <SearchFailureAlert error={search.error} />}
			{sameField && search.isSuccess && searched && (
				<Results
					hits={search.data}
					limit={searched.limit}
					primaryKey={primaryKey}
					preview={searched.previewAttributes}
					note={editedNote}
				>
					No record has a value for <code>{vector.attribute}</code>.
				</Results>
			)}
		</div>
	);
}

function sameVector(a: VectorAttribute, b: VectorAttribute): boolean {
	return a.attribute === b.attribute && a.distance === b.distance && a.embedModel === b.embedModel
		&& a.embedSource === b.embedSource;
}

function modelName(vector: VectorAttribute): ReactNode {
	return vector.embedModel !== undefined
		? (
			<>
				the <code>{vector.embedModel}</code> model
			</>
		)
		: (
			<>
				<code>{vector.attribute}</code>’s <code>@embed</code> model
			</>
		);
}

function SearchControls({ vectors, vector, onVectorChange, vectorDisabled, limit, onLimitChange }: {
	vectors: VectorAttribute[];
	vector: VectorAttribute;
	onVectorChange: (name: string) => void;
	vectorDisabled?: boolean;
	limit: number;
	onLimitChange: (limit: number) => void;
}) {
	const ids = { attribute: useId(), limit: useId() };
	return (
		<div className="flex flex-wrap items-end gap-x-6 gap-y-3">
			{vectors.length > 1 && (
				<div className="flex flex-col gap-1">
					<Label htmlFor={ids.attribute} className="text-xs text-muted-foreground">Vector</Label>
					<Select value={vector.attribute} onValueChange={onVectorChange} disabled={vectorDisabled}>
						<SelectTrigger id={ids.attribute} className="w-48">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{vectors.map(candidate => (
								<SelectItem key={candidate.attribute} value={candidate.attribute}>{candidate.attribute}</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}
			<div className="flex items-center gap-2">
				<Label htmlFor={ids.limit} className="font-normal">Show up to</Label>
				<Select value={String(limit)} onValueChange={value => onLimitChange(Number(value))}>
					<SelectTrigger id={ids.limit} className="w-20">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{RESULT_LIMITS.map(option => <SelectItem key={option} value={String(option)}>{option}</SelectItem>)}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}

function Results({ hits, limit, primaryKey, preview, note, children }: {
	hits: NearestRecord[];
	limit: number;
	primaryKey: string;
	preview: string[];
	note?: ReactNode;
	/** Harper leaves out records with no value for the vector, so an empty answer means none has one. */
	children: ReactNode;
}) {
	if (hits.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				{children}
				{note}
			</p>
		);
	}
	return (
		<section aria-label="Results" className="flex flex-col gap-2">
			<p className="text-xs text-muted-foreground">
				{hits.length === limit
					? `The ${hits.length} nearest records, nearest first. There may be more.`
					: `${hits.length} ${hits.length === 1 ? 'record' : 'records'}, nearest first.`}
				{note}
			</p>
			<ol className="flex flex-col gap-2">
				{hits.map((hit, rank) => (
					<li key={rank} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
						<div className="flex flex-wrap items-baseline gap-x-3">
							<span className="text-muted-foreground">#{rank + 1}</span>
							<span className="font-medium break-all">{formatKey(hit[primaryKey])}</span>
							<span className="ml-auto text-xs text-muted-foreground">
								distance {formatDistance(hit.$distance)}
							</span>
						</div>
						<Preview hit={hit} attributes={preview} />
					</li>
				))}
			</ol>
		</section>
	);
}

function Preview({ hit, attributes }: { hit: NearestRecord; attributes: string[] }) {
	const shown = attributes.filter(attribute => typeof hit[attribute] === 'string' && hit[attribute] !== '');
	if (shown.length === 0) {
		return null;
	}
	return (
		<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5">
			{shown.map(attribute => {
				const text = hit[attribute] as string;
				return (
					<div key={attribute} className="contents">
						<dt className="text-xs text-muted-foreground">{attribute}</dt>
						<dd className="min-w-0 break-words">
							{text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text}
						</dd>
					</div>
				);
			})}
		</dl>
	);
}

function formatDistance(distance: unknown): string {
	return typeof distance === 'number' && Number.isFinite(distance)
		? formatNumber(distance)
		: 'unknown';
}

function sameKey(a: unknown, b: unknown): boolean {
	return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function formatKey(key: unknown): string {
	return typeof key === 'object' && key !== null ? JSON.stringify(key) : String(key);
}
