import { Button } from '@/components/ui/button';
import { addCommasToNumbers } from '@/lib/addCommasToNumbers';
import { pluralize } from '@/lib/pluralize';
import { CloudUploadIcon, FunnelXIcon, PackageIcon, PlusIcon, TableIcon } from 'lucide-react';
import { ComponentType, ReactNode } from 'react';

/**
 * What the result set shows when it has no rows. Only a table that is genuinely, entirely empty is
 * invited to fill itself -- a page past the end, filters that matched nothing, and a page that came
 * back empty against a non-zero count are all tables that may well have records already.
 */
export function EmptyResultSet({
	tableName,
	hasPrimaryKey,
	isFiltered,
	isPastFirstPage,
	recordCount,
	canImportFile,
	canImportUrl,
	canSeedSample,
	canSeedRandom,
	canAddRecords,
	onImport,
	onSeed,
	onAddRecords,
	onClearFilters,
}: {
	readonly tableName: string;
	/** False only once the schema has arrived without one. */
	readonly hasPrimaryKey: boolean;
	readonly isFiltered: boolean;
	readonly isPastFirstPage: boolean;
	/** The table's own count, `undefined` until describe_table lands (describe_all carries none). */
	readonly recordCount: number | undefined;
	readonly canImportFile: boolean;
	readonly canImportUrl: boolean;
	/** A bundled sample dataset can be loaded (it arrives in a table of its own). */
	readonly canSeedSample: boolean;
	/** Random records can be generated for this table -- it has columns to model them on. */
	readonly canSeedRandom: boolean;
	readonly canAddRecords: boolean;
	readonly onImport: () => void;
	readonly onSeed: () => void;
	readonly onAddRecords: () => void;
	readonly onClearFilters: () => void;
}) {
	// Ahead of every other reason: no page, filter or count can explain a table that can't be listed.
	if (!hasPrimaryKey) {
		return (
			<EmptyResultSetShell>
				<Heading>
					<span className="font-mono">{tableName}</span> has no primary key
				</Heading>
				<p className="text-sm text-muted-foreground">
					{recordCount
						? `It reports ${pluralize(addCommasToNumbers(recordCount), 'record', 'records')}, but Studio`
						: 'Studio'}{' '}
					lists and opens records by their primary key, so it can't browse this table. Declare a primary key in the
					table's schema to browse it here.
				</p>
			</EmptyResultSetShell>
		);
	}

	// Page before filters: on page 3 of a filtered set, "nothing matched" would be wrong -- the
	// matches are on an earlier page.
	if (isPastFirstPage) {
		return (
			<EmptyResultSetShell>
				<Heading>No records on this page</Heading>
				<p className="text-sm text-muted-foreground">
					There are fewer records than this page starts at. Try an earlier page.
				</p>
			</EmptyResultSetShell>
		);
	}

	if (isFiltered) {
		return (
			<EmptyResultSetShell>
				<Heading>No records match these filters</Heading>
				<Button variant="ghost" onClick={onClearFilters}>
					<FunnelXIcon />
					Clear Filters
				</Button>
			</EmptyResultSetShell>
		);
	}

	// An empty page against a non-zero count is a page that failed to deliver, not an empty table.
	// `search_by_value` turns a 404 into `{ data: [] }` (getSearchByValue.ts), which Only If Cached --
	// on by default -- can produce on a cache miss.
	if (recordCount) {
		return (
			<EmptyResultSetShell>
				<Heading>No records came back</Heading>
				<p className="text-sm text-muted-foreground">
					This table reports records, but the page returned none. Try refreshing, or turn off Only If Cached in the
					table options menu.
				</p>
			</EmptyResultSetShell>
		);
	}

	const canImport = canImportFile || canImportUrl;
	const canSeed = canSeedSample || canSeedRandom;

	// Unknown count (first paint, or describe_table failed) describes the response instead of the
	// table. The invitations stand either way: withholding them until the count lands would flicker
	// the common case, a table that really is new and empty.
	return (
		<EmptyResultSetShell>
			<Heading>
				{recordCount === 0
					? (
						<>
							<span className="font-mono">{tableName}</span> has no records yet
						</>
					)
					: 'No records to show'}
			</Heading>
			{canImport && canSeed && (
				<p className="text-sm text-muted-foreground">
					Two ways to get some in — bring your own, or start from data we provide.
				</p>
			)}
			{(canImport || canSeed) && (
				<div className="flex w-full flex-col gap-3 sm:flex-row">
					{canImport && (
						<GuidanceCard
							Icon={CloudUploadIcon}
							title="Import your data"
							description={importDescription(canImportFile, canImportUrl)}
							action="Import data"
							onClick={onImport}
						/>
					)}
					{canSeed && (
						<GuidanceCard
							Icon={PackageIcon}
							title="Seed some data"
							description={seedDescription(canSeedSample, canSeedRandom)}
							action="Seed data"
							onClick={onSeed}
						/>
					)}
				</div>
			)}
			{canAddRecords && (
				<p className="text-sm text-muted-foreground">
					{canImport || canSeed ? 'Or write one yourself: ' : 'Write one yourself: '}
					<Button variant="link" className="h-auto p-0 text-sm dark:text-violet-300" onClick={onAddRecords}>
						<PlusIcon />
						Add New Record(s)
					</Button>
				</p>
			)}
		</EmptyResultSetShell>
	);
}

function importDescription(canImportFile: boolean, canImportUrl: boolean) {
	if (!canImportFile) {
		return 'Load a CSV from a URL the instance can reach.';
	}
	if (!canImportUrl) {
		return 'Upload a CSV or JSON file.';
	}
	return 'Upload a CSV or JSON file, or load a CSV from a URL the instance can reach.';
}

// A bundled dataset brings its own table name and the modal retargets the import to it, so the copy
// must not promise it lands in the table the user is looking at. Random records do fill this one.
function seedDescription(canSeedSample: boolean, canSeedRandom: boolean) {
	if (!canSeedSample) {
		return 'Fill this table with random records modelled on its columns.';
	}
	if (!canSeedRandom) {
		return 'Load a ready-made sample dataset. It arrives in a table of its own.';
	}
	return 'Fill this table with random records, or load a ready-made sample dataset into a table of its own.';
}

function EmptyResultSetShell({ children }: { readonly children: ReactNode }) {
	// Scrolling on the outer box, centring on an inner one with `min-h-full`: centring a
	// taller-than-the-box child directly in a scroll container puts its top above the scrollport,
	// where it can't be scrolled back to.
	return (
		<div className="h-full overflow-y-auto p-6">
			<div className="flex min-h-full items-center justify-center">
				<div className="flex w-full max-w-2xl flex-col items-center gap-4 text-center">
					<TableIcon aria-hidden className="size-8 text-muted-foreground/50" />
					{children}
				</div>
			</div>
		</div>
	);
}

function Heading({ children }: { readonly children: ReactNode }) {
	return <h2 className="text-base font-medium">{children}</h2>;
}

function GuidanceCard({
	Icon,
	title,
	description,
	action,
	onClick,
}: {
	readonly Icon: ComponentType<{ className?: string }>;
	readonly title: string;
	readonly description: string;
	readonly action: string;
	readonly onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			// `--primary` is a dark indigo that disappears into the table's near-black, so every accent
			// here carries the dark-mode violet the rest of the app pairs it with (see ClusterHome).
			className="group flex flex-1 cursor-pointer flex-col items-start gap-1.5 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-purple-200 focus-visible:outline-1 dark:border-grey-700 dark:hover:border-violet-300"
		>
			<span className="flex items-center gap-2 font-medium">
				<Icon className="size-4 text-primary dark:text-violet-300" />
				{title}
			</span>
			<span className="text-sm text-muted-foreground">{description}</span>
			<span className="mt-1 text-sm text-primary group-hover:underline dark:text-violet-300">{action} →</span>
		</button>
	);
}
