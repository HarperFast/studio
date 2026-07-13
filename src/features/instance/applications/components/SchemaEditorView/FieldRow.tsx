/**
 * Editor for a single field within a table card. Common controls (name, type,
 * array, required, primary key, indexed) sit on the surface; the full directive
 * set — relationships, computed values, timestamps, per-role access, and vector
 * index tuning — lives under an "Advanced" disclosure. Any directive the GUI
 * doesn't have a control for is listed read-only so it's visibly preserved.
 */
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { FieldModel, intArgValue, stringArgValue } from '@/features/instance/applications/lib/schema/types';
import { TrashIcon } from 'lucide-react';
import { harperScalars } from '../TextEditorView/harper-language/schema';
import { Disclosure, FIELD_SURFACE, NumberField, SwitchField, TextField } from './controls';

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
]);

export function FieldRow({
	field,
	typeNames,
	readOnly,
	disableRemove,
	error,
	onChange,
	onRemove,
}: {
	field: FieldModel;
	typeNames: string[];
	readOnly: boolean;
	/** True when this is the table's only field: a GraphQL type needs at least one, so removal is blocked. */
	disableRemove?: boolean;
	/** Validation message for this field (bad or duplicate name), shown inline. */
	error?: string;
	onChange: (field: FieldModel) => void;
	onRemove: () => void;
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

	const base = fieldBaseType(field);
	const list = fieldIsList(field);
	const required = fieldIsNonNull(field);
	const indexed = hasDirective(field.directives, 'indexed');

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
						onValueChange={value => onChange({ ...field, type: buildType(value, list, required) })}
					>
						<SelectTrigger className={`w-full ${FIELD_SURFACE}`}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{harperScalars.map(scalar => <SelectItem key={scalar.name} value={scalar.name}>{scalar.name}
							</SelectItem>)}
							{typeNames.filter(name => !harperScalars.some(scalar => scalar.name === name)).map(name => (
								<SelectItem key={name} value={name}>{name}</SelectItem>
							))}
							{/* Keep an unknown/custom type selectable so it isn't silently dropped. */}
							{base && !harperScalars.some(s => s.name === base) && !typeNames.includes(base) && (
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
								placeholder="HNSW"
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
		</div>
	);
}
