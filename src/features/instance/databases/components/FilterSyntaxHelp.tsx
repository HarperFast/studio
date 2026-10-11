import { FILTER_SYNTAX, FilterKind } from '@/features/instance/databases/functions/filterSyntaxHint';

const KIND_LABELS: Readonly<Record<FilterKind, string>> = {
	text: 'Text',
	number: 'Numbers',
	date: 'Dates',
	boolean: 'Booleans',
};

/** The filter syntax for every kind of column, for whoever can't hover an input to read its own. */
export function FilterSyntaxHelp({ id }: { id: string }) {
	return (
		// No ligatures: the mono font would draw `>=` and `!=` as single glyphs nobody can type.
		<section
			id={id}
			aria-label="Filter syntax"
			className="mx-4 mb-3 rounded-md border border-border p-3 text-sm [font-variant-ligatures:none]"
		>
			<dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
				{(Object.keys(FILTER_SYNTAX) as FilterKind[]).map((kind) => (
					<div key={kind}>
						<dt className="font-semibold">{KIND_LABELS[kind]}</dt>
						{FILTER_SYNTAX[kind].map((line) => <dd key={line} className="font-mono text-xs">{line}</dd>)}
					</div>
				))}
			</dl>
			<p className="mt-2 text-xs text-muted-foreground">
				A relationship column filters on a property of the related table:{' '}
				<code>.name Anvil</code>. A filter that no index can answer (a column marked “not indexed”, an ends with, a
				contains or a !=) asks before it runs, unless another filter in it uses an index.
			</p>
		</section>
	);
}
