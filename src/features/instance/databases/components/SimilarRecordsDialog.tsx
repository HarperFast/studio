import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { reportSearchFailure, SearchFailureAlert } from '@/features/instance/databases/components/SearchFailureAlert';
import {
	previewAttributes,
	SimilarRecordsSeed,
	VectorAttribute,
} from '@/features/instance/databases/functions/vectorAttributes';
import { InstanceTable } from '@/integrations/api/api.patch';
import {
	NearestRecord,
	NearestRecordsParams,
	searchNearestRecords,
} from '@/integrations/api/instance/database/searchNearestRecords';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';

const RESULT_LIMITS = [10, 20, 50, 100];
const PREVIEW_LENGTH = 200;

export function SimilarRecordsDialog({
	open,
	onOpenChange,
	databaseName,
	tableName,
	table,
	primaryKey,
	vectors,
	seed,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	databaseName: string;
	tableName: string;
	table: InstanceTable;
	primaryKey: string;
	vectors: VectorAttribute[];
	seed: SimilarRecordsSeed | undefined;
}) {
	const searchable = seed ? vectors.filter(vector => seed.vectors.has(vector.attribute)) : [];
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="lg:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Similar records</DialogTitle>
					<DialogDescription>
						The records in <code>{tableName}</code> whose stored vector is nearest this one’s.
					</DialogDescription>
				</DialogHeader>
				{/* Mounted only while open, so each opening searches from the record it was opened on. */}
				{open && seed && searchable.length > 0 && (
					<SimilarRecords
						databaseName={databaseName}
						tableName={tableName}
						table={table}
						primaryKey={primaryKey}
						vectors={searchable}
						seed={seed}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function SimilarRecords({ databaseName, tableName, table, primaryKey, vectors, seed }: {
	databaseName: string;
	tableName: string;
	table: InstanceTable;
	primaryKey: string;
	vectors: VectorAttribute[];
	seed: SimilarRecordsSeed;
}) {
	const { instanceClient } = useInstanceClientIdParams();
	const ids = { attribute: useId(), limit: useId() };
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
			target,
			previewAttributes: preview,
			limit,
		});
		// `searchKey` holds what a new search depends on; the rest is fixed while this is mounted.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchKey]);

	const current = search.variables?.attribute === vector.attribute && search.variables.limit === limit;

	return (
		<div className="flex min-w-0 flex-col gap-4">
			<div className="flex flex-wrap items-end gap-x-6 gap-y-3">
				{vectors.length > 1 && (
					<div className="flex flex-col gap-1">
						<Label htmlFor={ids.attribute} className="text-xs text-muted-foreground">Vector</Label>
						<Select value={vector.attribute} onValueChange={setAttributeName}>
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

			<p className="text-xs text-muted-foreground">
				Nearest <code>{formatKey(seed.key)}</code> by <code>{vector.attribute}</code>, using {vector.distance}{' '}
				distance: lower is closer.
			</p>

			{current && search.isPending && <p className="text-sm text-muted-foreground">Searching…</p>}
			{current && search.isError && <SearchFailureAlert error={search.error} />}
			{current && search.isSuccess && (
				<Results hits={search.data} limit={limit} primaryKey={primaryKey} preview={preview} />
			)}
		</div>
	);
}

function Results({ hits, limit, primaryKey, preview }: {
	hits: NearestRecord[];
	limit: number;
	primaryKey: string;
	preview: string[];
}) {
	if (hits.length === 0) {
		// Harper leaves out records with no value for the vector.
		return <p className="text-sm text-muted-foreground">No other record has this vector.</p>;
	}
	return (
		<section aria-label="Results" className="flex flex-col gap-2">
			<p className="text-xs text-muted-foreground">
				{hits.length === limit
					? `The ${hits.length} nearest records, nearest first. There may be more.`
					: `${hits.length} ${hits.length === 1 ? 'record' : 'records'}, nearest first.`}
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
		? distance.toLocaleString(undefined, { maximumSignificantDigits: 4 })
		: 'unknown';
}

function sameKey(a: unknown, b: unknown): boolean {
	return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function formatKey(key: unknown): string {
	return typeof key === 'object' && key !== null ? JSON.stringify(key) : String(key);
}
