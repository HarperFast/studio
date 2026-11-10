/**
 * Editor for a `FullText` field's `@fullText` declaration: which of the table's text fields it
 * indexes (with weight, highlighting and order), highlighting limits, the analyzer options and
 * synonym rules. Every change rewrites the directive through `writeFullTextConfig`, which leaves
 * unset options out of the file rather than writing Harper's defaults.
 *
 * Harper only builds an index on an audited table, so the panel also says when the table isn't one
 * and offers to turn audit on.
 */
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
	DEFAULT_FRAGMENT_LENGTH,
	DEFAULT_MAX_FRAGMENTS,
	emptyFullTextConfig,
	FULL_TEXT_ANALYZER,
	FULL_TEXT_DIRECTIVE,
	FULL_TEXT_TYPE,
	FullTextConfig,
	fullTextSourceCandidates,
	FullTextSourceKind,
	fullTextSourceKind,
	newFullTextSource,
	readFullTextConfig,
	writeFullTextConfig,
} from '@/features/instance/applications/lib/schema/fullText';
import { getArgValue } from '@/features/instance/applications/lib/schema/mutations';
import { boolArgValue, FieldModel, findDirective, TableModel } from '@/features/instance/applications/lib/schema/types';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { FIELD_SURFACE, NumberField, SwitchField } from './controls';

const KIND_LABEL: Record<FullTextSourceKind, string> = {
	string: 'String',
	stringList: '[String]',
	blob: 'Blob, text/plain',
};

export function FullTextIndexEditor({
	field,
	table,
	readOnly,
	onChange,
	onEnableAudit,
}: {
	field: FieldModel;
	table: TableModel;
	readOnly: boolean;
	onChange: (field: FieldModel) => void;
	onEnableAudit: () => void;
}) {
	// A bare `FullText` field is a declaration not started yet, not one Studio can't read.
	const config = findDirective(field.directives, FULL_TEXT_DIRECTIVE)
		? readFullTextConfig(field)
		: emptyFullTextConfig();
	const audit = boolArgValue(getArgValue(table.directives, 'table', 'audit'));
	const extras = shapeExtras(field);

	return (
		<div className="mt-3 flex flex-col gap-4 border-l-2 pl-3">
			<p className="text-xs text-muted-foreground">
				A full-text index holds no value. Search it by this field’s name with <code>matches</code>,{' '}
				<code>matches_phrase</code>, <code>matches_prefix</code>{' '}
				and the other full-text comparators. Harper builds it only for a RocksDB table with audit on.
			</p>

			{extras.length > 0 && (
				<ShapeNotice
					extras={extras}
					readOnly={readOnly}
					onRepair={() => onChange(withPlainShape(field))}
				/>
			)}

			{audit !== true && <AuditNotice auditOff={audit === false} readOnly={readOnly} onEnableAudit={onEnableAudit} />}

			{config
				? (
					<ConfigEditor
						config={config}
						table={table}
						readOnly={readOnly}
						onChange={next => onChange({ ...field, directives: writeFullTextConfig(field.directives, next) })}
					/>
				)
				: <UnreadableDeclaration field={field} />}
		</div>
	);
}

/**
 * What keeps `field` from the one shape Harper accepts, exactly `FullText` with exactly one
 * `@fullText`: the panel has no Array, Required or directive controls to undo these with.
 */
function shapeExtras(field: FieldModel): string[] {
	const extras: string[] = [];
	if (field.type.kind === 'list') {
		extras.push('Array');
	}
	if (field.type.nonNull) {
		extras.push('Required');
	}
	if (field.directives.filter(directive => directive.name === FULL_TEXT_DIRECTIVE).length > 1) {
		extras.push('a second @fullText');
	}
	for (const directive of field.directives) {
		if (directive.name !== FULL_TEXT_DIRECTIVE) {
			extras.push(`@${directive.name}`);
		}
	}
	return extras;
}

/** `field` as a plain `FullText` field, keeping its first `@fullText` (or starting one). */
function withPlainShape(field: FieldModel): FieldModel {
	const declaration = findDirective(field.directives, FULL_TEXT_DIRECTIVE);
	return {
		...field,
		type: { kind: 'named', name: FULL_TEXT_TYPE, nonNull: false },
		directives: declaration ? [declaration] : writeFullTextConfig([], emptyFullTextConfig()),
	};
}

function ShapeNotice({ extras, readOnly, onRepair }: { extras: string[]; readOnly: boolean; onRepair: () => void }) {
	return (
		<Alert variant="destructive">
			<TriangleAlertIcon />
			<AlertTitle>Harper accepts only a plain FullText field</AlertTitle>
			<AlertDescription>
				<p>This one also has {extras.join(', ')}. Harper refuses the whole schema until they're gone.</p>
				{!readOnly && (
					<Button type="button" size="sm" variant="defaultOutline" className="mt-2" onClick={onRepair}>
						Remove {extras.length === 1 ? 'it' : 'them'}
					</Button>
				)}
			</AlertDescription>
		</Alert>
	);
}

function AuditNotice(
	{ auditOff, readOnly, onEnableAudit }: { auditOff: boolean; readOnly: boolean; onEnableAudit: () => void },
) {
	return (
		<Alert variant="warning">
			<TriangleAlertIcon />
			<AlertTitle>{auditOff ? 'Audit is off for this table' : 'Turn on audit for this table'}</AlertTitle>
			<AlertDescription>
				<p>
					{auditOff
						? 'Harper only builds full-text indexes on audited tables, so it ignores this one while audit is off.'
						: 'Harper only builds full-text indexes on audited tables. This table follows the instance’s audit setting; turn audit on here so the index doesn’t depend on it.'}
				</p>
				{!readOnly && (
					<Button type="button" size="sm" variant="defaultOutline" className="mt-2" onClick={onEnableAudit}>
						Turn on audit
					</Button>
				)}
			</AlertDescription>
		</Alert>
	);
}

function UnreadableDeclaration({ field }: { field: FieldModel }) {
	const directive = findDirective(field.directives, 'fullText');
	return (
		<div className="flex flex-col gap-2 text-sm">
			<p className="text-muted-foreground">
				This index has comments or settings the visual editor can’t keep. Use “Edit as text” to change them.
			</p>
			{directive && directive.args.length > 0 && (
				<pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
					{directive.args.map(arg => `${arg.name}: ${arg.value}`).join('\n')}
				</pre>
			)}
		</div>
	);
}

function ConfigEditor({
	config,
	table,
	readOnly,
	onChange,
}: {
	config: FullTextConfig;
	table: TableModel;
	readOnly: boolean;
	onChange: (config: FullTextConfig) => void;
}) {
	const candidates = fullTextSourceCandidates(table);
	const fieldsByName = new Map(table.fields.map(candidate => [candidate.name, candidate]));
	const unused = candidates.filter(candidate => !config.fields.some(source => source.name === candidate.name));

	const setSource = (index: number, patch: Partial<FullTextConfig['fields'][number]>) =>
		onChange({
			...config,
			fields: config.fields.map((source, i) => (i === index ? { ...source, ...patch } : source)),
		});
	const moveSource = (index: number, offset: -1 | 1) => {
		const fields = [...config.fields];
		[fields[index], fields[index + offset]] = [fields[index + offset], fields[index]];
		onChange({ ...config, fields });
	};
	const highlighting = config.highlighting;

	return (
		<>
			<section className="flex flex-col gap-2" aria-label="Source fields">
				<div>
					<div className="text-sm font-medium">Source fields</div>
					<p className="text-xs text-muted-foreground">
						The text this index searches. A higher weight ranks matches in that field higher. Order matters to Harper:
						reordering the sources rebuilds the index.
					</p>
				</div>
				{config.fields.length === 0 && <p className="text-xs text-destructive">Pick at least one source field.</p>}
				<ol className="flex flex-col gap-2">
					{config.fields.map((source, index) => {
						const sourceField = fieldsByName.get(source.name);
						const kind = sourceField ? fullTextSourceKind(sourceField) : undefined;
						return (
							<li key={source.name} className="flex flex-wrap items-end gap-3 rounded border p-2">
								<div className="flex min-w-32 flex-1 flex-col gap-1">
									<span className="text-sm font-medium">{source.name}</span>
									<span className="text-xs text-muted-foreground">
										{kind ? KIND_LABEL[kind] : 'not a text field of this table'}
									</span>
								</div>
								<WeightField
									value={source.weight}
									disabled={readOnly}
									onChange={weight => setSource(index, { weight })}
								/>
								<SwitchField
									label="Highlight"
									checked={source.highlight === true}
									disabled={readOnly}
									onChange={highlight => setSource(index, { highlight: highlight || undefined })}
								/>
								<div className="flex gap-1">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										disabled={readOnly || index === 0}
										onClick={() => moveSource(index, -1)}
										title={`Move ${source.name} up`}
									>
										<ArrowUpIcon />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										disabled={readOnly || index === config.fields.length - 1}
										onClick={() => moveSource(index, 1)}
										title={`Move ${source.name} down`}
									>
										<ArrowDownIcon />
									</Button>
									<Button
										type="button"
										variant="destructiveGhost"
										size="icon"
										disabled={readOnly}
										onClick={() => onChange({ ...config, fields: config.fields.filter((_, i) => i !== index) })}
										title={`Remove ${source.name}`}
									>
										<XIcon />
									</Button>
								</div>
							</li>
						);
					})}
				</ol>
				{candidates.length === 0
					? (
						<p className="text-xs text-muted-foreground">
							This table has no String, [String] or Blob field to index yet. Add one, then pick it here.
						</p>
					)
					: unused.length > 0 && !readOnly && (
						<Select
							value=""
							onValueChange={name => {
								const candidate = fieldsByName.get(name);
								if (candidate) {
									onChange({ ...config, fields: [...config.fields, newFullTextSource(candidate)] });
								}
							}}
						>
							<SelectTrigger className={`w-full md:w-64 ${FIELD_SURFACE}`} aria-label="Add a source field">
								<SelectValue placeholder="Add a source field…" />
							</SelectTrigger>
							<SelectContent>
								{unused.map(candidate => (
									<SelectItem key={candidate.name} value={candidate.name}>
										{candidate.name}{' '}
										<span className="text-muted-foreground">({KIND_LABEL[fullTextSourceKind(candidate)!]})</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
			</section>

			<section className="flex flex-col gap-2" aria-label="Highlighting">
				<SwitchField
					label="Highlighting"
					description="return matched spans and fragments"
					checked={highlighting !== undefined}
					disabled={readOnly}
					onChange={on => onChange({ ...config, highlighting: on ? {} : undefined })}
				/>
				{highlighting && (
					<>
						<p className="text-xs text-muted-foreground">
							Only sources with Highlight on return highlights.
						</p>
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							<NumberField
								label={`Fragments per value (default ${DEFAULT_MAX_FRAGMENTS})`}
								value={highlighting.maxFragments}
								min={1}
								disabled={readOnly}
								onChange={maxFragments => onChange({ ...config, highlighting: { ...highlighting, maxFragments } })}
							/>
							<NumberField
								label={`Fragment length, in characters (default ${DEFAULT_FRAGMENT_LENGTH})`}
								value={highlighting.fragmentLength}
								min={1}
								disabled={readOnly}
								onChange={fragmentLength => onChange({ ...config, highlighting: { ...highlighting, fragmentLength } })}
							/>
						</div>
					</>
				)}
			</section>

			<section className="flex flex-col gap-2" aria-label="Analyzer">
				<div>
					<div className="text-sm font-medium">Analyzer</div>
					<p className="text-xs text-muted-foreground">
						Analyzer <code>{config.analyzer ?? FULL_TEXT_ANALYZER}</code>
						{config.analyzer === undefined ? ' (the only one Harper supports)' : ''}. Changing these options rebuilds
						the index.
					</p>
				</div>
				<div className="flex flex-wrap gap-x-6 gap-y-2">
					<SwitchField
						label="Stop words"
						description="ignore words like “the”"
						checked={config.stopWords !== false}
						disabled={readOnly}
						onChange={on => onChange({ ...config, stopWords: on ? undefined : false })}
					/>
					<SwitchField
						label="Positions"
						description="needed for phrase search"
						checked={config.positions !== false}
						disabled={readOnly}
						onChange={on => onChange({ ...config, positions: on ? undefined : false })}
					/>
					<SwitchField
						label="Surface terms"
						description="needed for prefix search and highlighting"
						checked={config.surfaceTerms !== false}
						disabled={readOnly}
						onChange={on => onChange({ ...config, surfaceTerms: on ? undefined : false })}
					/>
				</div>
			</section>

			<SynonymsEditor config={config} readOnly={readOnly} onChange={onChange} />
		</>
	);
}

function WeightField(
	{ value, disabled, onChange }: { value: number | undefined; disabled: boolean; onChange: (value?: number) => void },
) {
	const id = useId();
	return (
		<div className="flex w-24 flex-col gap-1">
			<label htmlFor={id} className="text-xs text-muted-foreground">Weight</label>
			<Input
				id={id}
				type="number"
				className={FIELD_SURFACE}
				min={0}
				step="any"
				placeholder="1"
				value={value ?? ''}
				disabled={disabled}
				onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
			/>
		</div>
	);
}

/** `"shoe, trainer"` ⇄ `["shoe", "trainer"]`. */
function splitReplacements(text: string): string[] {
	return text === '' ? [] : text.split(',').map(part => part.trim());
}

function SynonymsEditor(
	{ config, readOnly, onChange }: {
		config: FullTextConfig;
		readOnly: boolean;
		onChange: (config: FullTextConfig) => void;
	},
) {
	const setRule = (index: number, patch: Partial<FullTextConfig['synonyms'][number]>) =>
		onChange({
			...config,
			synonyms: config.synonyms.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
		});
	return (
		<section className="flex flex-col gap-2" aria-label="Synonyms">
			<div>
				<div className="text-sm font-medium">Synonyms</div>
				<p className="text-xs text-muted-foreground">
					When a record has the term, the index also holds its replacements. Changing synonyms rebuilds the index.
				</p>
			</div>
			{config.synonyms.map((rule, index) => (
				<div key={index} className="flex flex-wrap items-end gap-2">
					<SynonymInput
						label="Term"
						value={rule.source}
						disabled={readOnly}
						onChange={source => setRule(index, { source })}
					/>
					<ReplacementsInput
						value={rule.replacements}
						disabled={readOnly}
						onChange={replacements => setRule(index, { replacements })}
					/>
					<Button
						type="button"
						variant="destructiveGhost"
						size="icon"
						disabled={readOnly}
						onClick={() => onChange({ ...config, synonyms: config.synonyms.filter((_, i) => i !== index) })}
						title="Remove synonym rule"
					>
						<XIcon />
					</Button>
				</div>
			))}
			{!readOnly && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="self-start"
					onClick={() => onChange({ ...config, synonyms: [...config.synonyms, { source: '', replacements: [] }] })}
				>
					<PlusIcon /> Add synonym
				</Button>
			)}
		</section>
	);
}

function sameList(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Replacements as comma-separated text, kept as typed (`"shoe,"` mid-word) so the cursor never jumps.
 * The text is rebuilt only when the list changes from outside, such as a revert. That is judged
 * against the list this input last saw, never by re-reading the text: `["a,b"]` or `[" shoe"]` from a
 * file can't survive a trip through the text, and comparing against it would reset forever.
 */
function ReplacementsInput(
	{ value, disabled, onChange }: { value: string[]; disabled: boolean; onChange: (value: string[]) => void },
) {
	const [draft, setDraft] = useState(() => value.join(', '));
	const [seen, setSeen] = useState(value);
	if (!sameList(seen, value)) {
		setSeen(value);
		setDraft(value.join(', '));
	}
	return (
		<SynonymInput
			label="Replacements, comma-separated"
			value={draft}
			disabled={disabled}
			grow
			onChange={text => {
				const next = splitReplacements(text);
				setDraft(text);
				setSeen(next);
				onChange(next);
			}}
		/>
	);
}

function SynonymInput({ label, value, disabled, grow, onChange }: {
	label: string;
	value: string;
	disabled: boolean;
	grow?: boolean;
	onChange: (value: string) => void;
}) {
	const id = useId();
	return (
		<div className={`flex flex-col gap-1 ${grow ? 'min-w-48 flex-1' : 'w-40'}`}>
			<label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
			<Input
				id={id}
				type="text"
				className={FIELD_SURFACE}
				value={value}
				disabled={disabled}
				onChange={event => onChange(event.target.value)}
			/>
		</div>
	);
}
