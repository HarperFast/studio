/**
 * Controls for `@embed` and `@decide`: a field Harper fills from another field, with one of the
 * instance's models, whenever a record is written. Shown on a field whose type can carry the
 * directive (a `[Float]` field for `@embed`; a `String`, `Boolean` or `Int` field for `@decide`),
 * and on any field that already has one, so a misplaced directive can be seen and removed.
 */
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
	canEmbed,
	DECIDE_DIRECTIVE,
	decideLeaf,
	decideValues,
	derivedFieldErrors,
	derivedSourceNames,
	EMBED_DIRECTIVE,
	setDecideValues,
	withDecide,
	withEmbed,
} from '@/features/instance/applications/lib/schema/derivedFields';
import {
	getArgValue,
	hasDirective,
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
import { useId, useState } from 'react';
import { availableOn, harperDirectives } from '../TextEditorView/harper-language/schema';
import { FIELD_SURFACE, NumberField, SwitchField, TextField } from './controls';

const SELECT_CLASS = `h-9 w-full rounded-md border border-input bg-card px-3 text-sm ${FIELD_SURFACE}`;

function directiveAvailable(name: string, harperVersion: string | undefined): boolean {
	const directive = harperDirectives.find((candidate) => candidate.name === name);
	return !!directive && availableOn(directive, harperVersion);
}

export function DerivedValueEditor({ field, table, models, harperVersion, readOnly, onChange }: {
	field: FieldModel;
	table: TableModel;
	/** The instance's model names, to choose from. Absent when they can't be read, and the name is typed instead. */
	models: InstanceModelNames | undefined;
	harperVersion: string | undefined;
	readOnly: boolean;
	onChange: (field: FieldModel) => void;
}) {
	const embeds = hasDirective(field.directives, EMBED_DIRECTIVE);
	const decides = hasDirective(field.directives, DECIDE_DIRECTIVE);
	const offerEmbed = embeds || (canEmbed(field) && directiveAvailable(EMBED_DIRECTIVE, harperVersion));
	const leaf = decideLeaf(field);
	const offerDecide = decides || (!!leaf && directiveAvailable(DECIDE_DIRECTIVE, harperVersion));
	if (!offerEmbed && !offerDecide) {
		return null;
	}

	const sources = derivedSourceNames(table, field);
	const errors = derivedFieldErrors(field, table);
	const setDirectives = (directives: FieldModel['directives']) => onChange({ ...field, directives });
	const str = (directive: string, arg: string) => stringArgValue(getArgValue(field.directives, directive, arg)) ?? '';
	const setStr = (directive: string, arg: string, value: string) =>
		setDirectives(setStringArg(field.directives, directive, arg, value));
	const kept = (findDirective(field.directives, DECIDE_DIRECTIVE)?.args ?? [])
		.map((arg) => arg.name)
		.filter((name) => name === 'confidence' || name === 'decision');

	return (
		<div className="mt-3 flex flex-col gap-3 rounded-md border border-dashed p-3">
			{offerEmbed && (
				<>
					<SwitchField
						label="Embed another field"
						description="@embed"
						checked={embeds}
						disabled={readOnly}
						onChange={(on) => onChange(withEmbed(field, on))}
					/>
					{embeds && (
						<>
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
								<NameSelect
									label="Field to embed"
									value={str(EMBED_DIRECTIVE, 'source')}
									names={sources}
									empty="Choose a field"
									missing="not a field of this table"
									disabled={readOnly}
									onChange={(value) => setStr(EMBED_DIRECTIVE, 'source', value)}
								/>
								<ModelSelect
									label="Embedding model"
									value={str(EMBED_DIRECTIVE, 'model')}
									names={models?.embedding}
									empty="Choose a model"
									disabled={readOnly}
									onChange={(value) => setStr(EMBED_DIRECTIVE, 'model', value)}
								/>
							</div>
							<p className="text-xs text-muted-foreground">
								Harper fills this field with a vector of the other field's text whenever a record is written, and
								indexes it for vector search.
							</p>
						</>
					)}
				</>
			)}

			{offerDecide && (
				<>
					<SwitchField
						label="Decide from another field"
						description="@decide"
						checked={decides}
						disabled={readOnly}
						onChange={(on) => onChange(withDecide(field, on))}
					/>
					{decides && (
						<>
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
								<NameSelect
									label="Field to decide from"
									value={str(DECIDE_DIRECTIVE, 'source')}
									names={sources}
									empty="Choose a field"
									missing="not a field of this table"
									disabled={readOnly}
									onChange={(value) => setStr(DECIDE_DIRECTIVE, 'source', value)}
								/>
								<ModelSelect
									label="Decision model"
									value={str(DECIDE_DIRECTIVE, 'model')}
									names={models?.decision}
									empty="default"
									disabled={readOnly}
									onChange={(value) => setStr(DECIDE_DIRECTIVE, 'model', value)}
								/>
								{leaf === 'Int' && (
									<>
										<NumberField
											label="Minimum"
											value={intArgValue(getArgValue(field.directives, DECIDE_DIRECTIVE, 'minimum'))}
											disabled={readOnly}
											onChange={(value) =>
												setDirectives(setIntArg(field.directives, DECIDE_DIRECTIVE, 'minimum', value))}
										/>
										<NumberField
											label="Maximum"
											value={intArgValue(getArgValue(field.directives, DECIDE_DIRECTIVE, 'maximum'))}
											disabled={readOnly}
											onChange={(value) =>
												setDirectives(setIntArg(field.directives, DECIDE_DIRECTIVE, 'maximum', value))}
										/>
									</>
								)}
							</div>
							{leaf === 'String' && (
								<ValuesField
									values={decideValues(field.directives)}
									written={getArgValue(field.directives, DECIDE_DIRECTIVE, 'values')}
									disabled={readOnly}
									onChange={(values) => setDirectives(setDecideValues(field.directives, values))}
								/>
							)}
							<TextField
								label="Instructions for the model (optional)"
								value={str(DECIDE_DIRECTIVE, 'instructions')}
								disabled={readOnly}
								onChange={(value) => setStr(DECIDE_DIRECTIVE, 'instructions', value)}
							/>
							<p className="text-xs text-muted-foreground">
								Harper has the model choose this field's value whenever a record is written. If the model can't decide,
								the write fails.
								{kept.length > 0 && ` Also set, and kept as written: ${kept.join(', ')}.`}
							</p>
						</>
					)}
				</>
			)}

			{errors.length > 0 && (
				<ul className="flex flex-col gap-1 text-xs text-destructive">
					{errors.map((error) => <li key={error}>{error}</li>)}
				</ul>
			)}
		</div>
	);
}

/** A choice among `names`. A value that isn't one of them stays selected and is marked, never dropped. */
function NameSelect({ label, value, names, empty, missing, disabled, onChange }: {
	label: string;
	value: string;
	names: readonly string[];
	/** The label of the choice that sets nothing. */
	empty: string;
	/** What to call a value that isn't in `names`. */
	missing: string;
	disabled: boolean;
	onChange: (value: string) => void;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			<Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
			<select
				id={id}
				className={SELECT_CLASS}
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value)}
			>
				<option value="">{empty}</option>
				{names.map((name) => <option key={name} value={name}>{name}</option>)}
				{value !== '' && !names.includes(value) && <option value={value}>{value} ({missing})</option>}
			</select>
		</div>
	);
}

/** One of the instance's models, or a typed name when Studio couldn't read which models it has. */
function ModelSelect({ label, value, names, empty, disabled, onChange }: {
	label: string;
	value: string;
	names: readonly string[] | undefined;
	empty: string;
	disabled: boolean;
	onChange: (value: string) => void;
}) {
	if (names === undefined) {
		return <TextField label={label} value={value} placeholder={empty} disabled={disabled} onChange={onChange} />;
	}
	// An unset decision model means `default`, so that name isn't offered a second time.
	const unsetIsDefault = empty === 'default';
	const offered = unsetIsDefault ? names.filter((name) => name !== 'default') : names;
	const missing = 'not a model on this instance';
	return (
		<div className="flex flex-col gap-1">
			<NameSelect
				label={label}
				value={value}
				names={offered}
				empty={unsetIsDefault && !names.includes('default') ? `default (${missing})` : empty}
				missing={missing}
				disabled={disabled}
				onChange={onChange}
			/>
			{names.length === 0 && (
				<span className="text-xs text-muted-foreground">
					This instance has none yet. Add one under Config, AI Models.
				</span>
			)}
		</div>
	);
}

/** The strings a `String` field can be given, one per line. */
function ValuesField({ values, written, disabled, onChange }: {
	values: string[] | undefined;
	/** The argument as written, shown when it isn't a list of strings the editor can rewrite. */
	written: string | undefined;
	disabled: boolean;
	onChange: (values: string[]) => void;
}) {
	const id = useId();
	const clean = (text: string) => text.split('\n').map((value) => value.trim()).filter((value) => value !== '');
	const stored = (values ?? []).join('\n');
	// What is being typed, blank lines and all. It is replaced only when the stored values stop matching it.
	const [text, setText] = useState(stored);
	if (clean(text).join('\n') !== stored) {
		setText(stored);
	}
	if (written !== undefined && values === undefined) {
		return (
			<p className="text-xs text-muted-foreground">
				Values: <code className="font-mono">{written}</code>. Edit them as text.
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-1">
			<Label htmlFor={id} className="text-xs text-muted-foreground">Values to choose from, one per line</Label>
			<Textarea
				id={id}
				className={FIELD_SURFACE}
				rows={Math.min(8, Math.max(3, (values?.length ?? 0) + 1))}
				value={text}
				disabled={disabled}
				onChange={(event) => {
					setText(event.target.value);
					onChange(clean(event.target.value));
				}}
			/>
		</div>
	);
}
