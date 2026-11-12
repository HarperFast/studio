/**
 * Editor for a single field within a table card. Common controls (name, type,
 * array, required, primary key, indexed) sit on the surface; the full directive
 * set — relationships, computed values, timestamps, per-role access, and vector
 * index tuning — lives under an "Advanced" disclosure. Any directive the GUI
 * doesn't have a control for is listed read-only so it's visibly preserved.
 * A `FullText` field takes none of those; it gets the {@link FullTextIndexEditor} instead.
 */
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DECIDE_DIRECTIVE, EMBED_DIRECTIVE } from '@/features/instance/applications/lib/schema/derivedFields';
import {
	emptyFullTextConfig,
	FULL_TEXT_DIRECTIVE,
	FULL_TEXT_TYPE,
	writeFullTextConfig,
} from '@/features/instance/applications/lib/schema/fullText';
import {
	buildType,
	fieldBaseType,
	fieldIsList,
	fieldIsNonNull,
	getArgValue,
	hasDirective,
	setDirectivePresent,
	setIntArg,
	setStringArg,
} from '@/features/instance/applications/lib/schema/mutations';
import {
	FieldModel,
	findDirective,
	intArgValue,
	stringArgValue,
	TableModel,
} from '@/features/instance/applications/lib/schema/types';
import { InstanceModelNames } from '@/integrations/api/instance/models/models';
import { TrashIcon } from 'lucide-react';
import { ReactNode } from 'react';
import { availableOn, harperScalars } from '../TextEditorView/harper-language/schema';
import { Disclosure, FIELD_SURFACE, NumberField, SwitchField, TextField } from './controls';
import { DerivedValueEditor } from './DerivedValueEditor';
import { FullTextIndexEditor } from './FullTextIndexEditor';

/** Field directives the GUI has dedicated controls for; anything else is "preserved". */
const KNOWN_FIELD_DIRECTIVES = new Set([
	'primaryKey',
	'indexed',
	'computed',
	'relationship',
	'allow',
	'createdTime',
	'updatedTime',
	'expiresAt',
	'enumerable',
	EMBED_DIRECTIVE,
	DECIDE_DIRECTIVE,
	FULL_TEXT_DIRECTIVE,
]);

/**
 * The field after its type is switched in the dropdown. A `FullText` field is exactly `FullText`
 * with exactly `@fullText` — Harper refuses any other directive on it — so switching to it starts a
 * fresh declaration, and switching away drops the declaration, which no other type can carry.
 */
function withBaseType(field: FieldModel, base: string, list: boolean, required: boolean): FieldModel {
	if (base === FULL_TEXT_TYPE) {
		// A misplaced `@fullText` (on a `String`, say) is the declaration this switch was for.
		const declaration = findDirective(field.directives, FULL_TEXT_DIRECTIVE);
		return {
			...field,
			type: buildType(FULL_TEXT_TYPE, false, false),
			directives: declaration ? [declaration] : writeFullTextConfig([], emptyFullTextConfig()),
		};
	}
	return {
		...field,
		type: buildType(base, list, required),
		directives: field.directives.filter(directive => directive.name !== FULL_TEXT_DIRECTIVE),
	};
}

export function FieldRow({
	field,
	table,
	typeNames,
	harperVersion,
	models,
	readOnly,
	disableRemove,
	error,
	derivedErrors,
	onChange,
	onRemove,
	onEnableAudit,
}: {
	field: FieldModel;
	/** The table holding the field: a full-text index picks its sources from it and needs it audited. */
	table: TableModel;
	typeNames: string[];
	/** The instance's Harper version, to offer only the types it has; `undefined` when unknown. */
	harperVersion: string | undefined;
	models?: InstanceModelNames;
	readOnly: boolean;
	/** True when this is the table's only field: a GraphQL type needs at least one, so removal is blocked. */
	disableRemove?: boolean;
	/** Validation message for this field (bad or duplicate name), shown inline. */
	error?: string;
	/** What `validateSchema` found wrong with the field's `@embed` or `@decide`. */
	derivedErrors?: readonly string[];
	onChange: (field: FieldModel) => void;
	onRemove: () => void;
	/** Turn on `@table(audit: true)`, which a full-text index needs. */
	onEnableAudit: () => void;
}) {
	const base = fieldBaseType(field);
	const list = fieldIsList(field);
	const required = fieldIsNonNull(field);
	const indexed = hasDirective(field.directives, 'indexed');
	const fullText = base === FULL_TEXT_TYPE;
	const scalars = harperScalars.filter(scalar => availableOn(scalar, harperVersion));

	const preserved = field.directives.filter(directive => !KNOWN_FIELD_DIRECTIVES.has(directive.name));

	return (
		<div className="rounded-lg border p-3">
			<div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
				<TextField
					label="Field name"
					value={field.name}
					disabled={readOnly}
					invalid={!!error}
					error={error}
					onChange={name => onChange({ ...field, name })}
				/>
				<div className="flex flex-col gap-1">
					<span className="text-xs text-muted-foreground">Type</span>
					<Select
						value={base}
						disabled={readOnly}
						onValueChange={value => onChange(withBaseType(field, value, list, required))}
					>
						<SelectTrigger className={`w-full ${FIELD_SURFACE}`} aria-label="Type">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{scalars.map(scalar => <SelectItem key={scalar.name} value={scalar.name}>{scalar.name}</SelectItem>)}
							{typeNames.filter(name => !harperScalars.some(scalar => scalar.name === name)).map(name => (
								<SelectItem key={name} value={name}>{name}</SelectItem>
							))}
							{/* Keep an unknown/custom type — or one this Harper predates — selectable so it isn't silently dropped. */}
							{base && !scalars.some(s => s.name === base) && !typeNames.includes(base) && (
								<SelectItem value={base}>{base}</SelectItem>
							)}
						</SelectContent>
					</Select>
				</div>
				<Button
					type="button"
					variant="destructiveGhost"
					size="icon"
					className="self-end"
					disabled={readOnly || disableRemove}
					onClick={onRemove}
					title={disableRemove ? 'A table needs at least one field' : 'Remove field'}
				>
					<TrashIcon />
				</Button>
			</div>

			{fullText
				? (
					<FullTextIndexEditor
						field={field}
						table={table}
						readOnly={readOnly}
						onChange={onChange}
						onEnableAudit={onEnableAudit}
					/>
				)
				: (
					<ScalarFieldControls
						field={field}
						base={base}
						list={list}
						required={required}
						indexed={indexed}
						preserved={preserved}
						readOnly={readOnly}
						onChange={onChange}
						derived={
							<DerivedValueEditor
								field={field}
								table={table}
								models={models}
								harperVersion={harperVersion}
								errors={derivedErrors}
								readOnly={readOnly}
								onChange={onChange}
							/>
						}
					/>
				)}
		</div>
	);
}

function ScalarFieldControls({
	field,
	base,
	list,
	required,
	indexed,
	preserved,
	readOnly,
	onChange,
	derived,
}: {
	field: FieldModel;
	base: string;
	list: boolean;
	required: boolean;
	indexed: boolean;
	preserved: FieldModel['directives'];
	readOnly: boolean;
	onChange: (field: FieldModel) => void;
	derived: ReactNode;
}) {
	const setDirectives = (directives: FieldModel['directives']) => onChange({ ...field, directives });
	const togglePresent = (name: string, present: boolean) =>
		setDirectives(setDirectivePresent(field.directives, name, present));
	const setStr = (dir: string, arg: string, text: string) =>
		setDirectives(setStringArg(field.directives, dir, arg, text));
	const setNum = (dir: string, arg: string, value: number | undefined) =>
		setDirectives(setIntArg(field.directives, dir, arg, value));
	const str = (dir: string, arg: string) => stringArgValue(getArgValue(field.directives, dir, arg)) ?? '';
	const num = (dir: string, arg: string) => intArgValue(getArgValue(field.directives, dir, arg));

	return (
		<>
			<div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
				<SwitchField
					label="Array"
					checked={list}
					disabled={readOnly}
					onChange={value => onChange({ ...field, type: buildType(base, value, required) })}
				/>
				<SwitchField
					label="Required"
					checked={required}
					disabled={readOnly}
					onChange={value => onChange({ ...field, type: buildType(base, list, value) })}
				/>
				<SwitchField
					label="Primary key"
					checked={hasDirective(field.directives, 'primaryKey')}
					disabled={readOnly}
					onChange={value => togglePresent('primaryKey', value)}
				/>
				<SwitchField
					label="Indexed"
					checked={indexed}
					disabled={readOnly}
					onChange={value => togglePresent('indexed', value)}
				/>
			</div>

			{derived}

			<Disclosure label="Advanced">
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap gap-x-6 gap-y-2">
						<SwitchField
							label="Created time"
							description="set on insert"
							checked={hasDirective(field.directives, 'createdTime')}
							disabled={readOnly}
							onChange={value => togglePresent('createdTime', value)}
						/>
						<SwitchField
							label="Updated time"
							description="set on update"
							checked={hasDirective(field.directives, 'updatedTime')}
							disabled={readOnly}
							onChange={value => togglePresent('updatedTime', value)}
						/>
						<SwitchField
							label="Expires at"
							checked={hasDirective(field.directives, 'expiresAt')}
							disabled={readOnly}
							onChange={value => togglePresent('expiresAt', value)}
						/>
						<SwitchField
							label="Enumerable"
							checked={hasDirective(field.directives, 'enumerable')}
							disabled={readOnly}
							onChange={value => togglePresent('enumerable', value)}
						/>
					</div>

					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<TextField
							label="Relationship — from (this table's key field)"
							value={str('relationship', 'from')}
							disabled={readOnly}
							onChange={value => setStr('relationship', 'from', value)}
						/>
						<TextField
							label="Relationship — to (other table's key field)"
							value={str('relationship', 'to')}
							disabled={readOnly}
							onChange={value => setStr('relationship', 'to', value)}
						/>
						<TextField
							label="Computed — from (expression)"
							value={str('computed', 'from')}
							disabled={readOnly}
							onChange={value => setStr('computed', 'from', value)}
						/>
						<NumberField
							label="Computed — version"
							value={num('computed', 'version')}
							disabled={readOnly}
							onChange={value => setNum('computed', 'version', value)}
						/>
						<TextField
							label="Allow — role"
							value={str('allow', 'role')}
							disabled={readOnly}
							onChange={value => setStr('allow', 'role', value)}
						/>
					</div>

					<div>
						<div className="text-xs font-medium text-muted-foreground">
							Index options <span className="italic">(vector / HNSW — requires Indexed)</span>
						</div>
						<div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
							<TextField
								label="Index type"
								placeholder="e.g. HNSW"
								value={str('indexed', 'type')}
								disabled={readOnly}
								onChange={value => setStr('indexed', 'type', value)}
							/>
							<TextField
								label="Distance"
								placeholder="cosine"
								value={str('indexed', 'distance')}
								disabled={readOnly}
								onChange={value => setStr('indexed', 'distance', value)}
							/>
							<NumberField
								label="efConstruction"
								value={num('indexed', 'efConstruction')}
								disabled={readOnly}
								onChange={value => setNum('indexed', 'efConstruction', value)}
							/>
							<NumberField
								label="M"
								value={num('indexed', 'M')}
								disabled={readOnly}
								onChange={value => setNum('indexed', 'M', value)}
							/>
							<NumberField
								label="optimizeRouting"
								value={num('indexed', 'optimizeRouting')}
								disabled={readOnly}
								onChange={value => setNum('indexed', 'optimizeRouting', value)}
							/>
							<NumberField
								label="mL"
								value={num('indexed', 'mL')}
								disabled={readOnly}
								onChange={value => setNum('indexed', 'mL', value)}
							/>
							<NumberField
								label="efConstructionSearch"
								value={num('indexed', 'efConstructionSearch')}
								disabled={readOnly}
								onChange={value => setNum('indexed', 'efConstructionSearch', value)}
							/>
						</div>
					</div>

					{preserved.length > 0 && (
						<div className="text-xs text-muted-foreground">
							Preserved directives:{' '}
							{preserved.map(directive => <code key={directive.name} className="mr-1">@{directive.name}</code>)}
						</div>
					)}
				</div>
			</Disclosure>
		</>
	);
}
