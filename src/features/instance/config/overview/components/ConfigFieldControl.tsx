import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import { stableJson } from '@/lib/stableJson';
import { useState } from 'react';
import type { ConfigFieldDef } from '../configSchemaFields';

interface ConfigFieldControlProps {
	field: ConfigFieldDef;
	value: unknown;
	/** The value before this edit, which decides what clearing a field means. */
	before: unknown;
	disabled: boolean;
	invalid: boolean;
	describedBy?: string;
	onChange: (value: unknown) => void;
	onError: (message: string | undefined) => void;
}

type Parsed = { value: unknown; error?: undefined } | { value?: undefined; error: string };

/** Whether `value` is one the field's control can show; anything else stays in the JSON editor. */
export function fitsConfigField(field: ConfigFieldDef, value: unknown): boolean {
	if (value === undefined || (value === null && field.nullable)) { return true; }
	switch (field.kind) {
		case 'boolean':
			return typeof value === 'boolean';
		case 'enum':
		case 'string':
			return typeof value === 'string';
		case 'integer':
		case 'number':
			return typeof value === 'number';
		case 'stringOrNumber':
			return typeof value === 'string' || typeof value === 'number';
		case 'stringList':
			// Harper's own default is `[null]`, and a null entry allows nothing (harper `utility/corsAccessList.ts`).
			return Array.isArray(value) && value.every(item => typeof item === 'string' || item === null);
	}
}

function formatText(field: ConfigFieldDef, value: unknown): string {
	if (value === undefined || value === null) { return ''; }
	if (field.kind === 'stringList') {
		return (value as unknown[]).filter(item => typeof item === 'string').join('\n');
	}
	return String(value);
}

const NUMERIC = /^-?\d+(?:\.\d+)?$/;

/** What clearing the field means: back to unset if it was, otherwise null where Harper takes one. */
function parseEmpty(field: ConfigFieldDef, before: unknown): Parsed {
	if (before === undefined) { return { value: undefined }; }
	if (field.kind === 'stringList') {
		return { value: Array.isArray(before) || !field.nullable ? [] : null };
	}
	if (field.nullable) { return { value: null }; }
	if (field.kind === 'string') { return { value: '' }; }
	return { error: field.kind === 'stringOrNumber' ? 'Enter a value.' : 'Enter a number.' };
}

export function parseConfigFieldText(field: ConfigFieldDef, text: string, before: unknown): Parsed {
	const trimmed = text.trim();
	if (field.kind === 'stringList') {
		const items = text.split('\n').map(line => line.trim()).filter(Boolean);
		return items.length === 0 ? parseEmpty(field, before) : { value: items };
	}
	if (trimmed === '') { return parseEmpty(field, before); }
	if (field.kind === 'string') { return { value: text }; }
	if (field.kind === 'stringOrNumber') { return { value: NUMERIC.test(trimmed) ? Number(trimmed) : trimmed }; }
	const number = Number(trimmed);
	if (!Number.isFinite(number)) { return { error: 'Enter a number.' }; }
	if (field.kind === 'integer' && !Number.isInteger(number)) { return { error: 'Enter a whole number.' }; }
	if (field.minimum !== undefined && number < field.minimum) { return { error: `Enter ${field.minimum} or more.` }; }
	if (field.maximum !== undefined && number > field.maximum) { return { error: `Enter ${field.maximum} or less.` }; }
	return { value: number };
}

function sameValue(a: unknown, b: unknown) {
	return a === undefined || b === undefined ? a === b : stableJson(a) === stableJson(b);
}

function TextControl(
	{ field, value, before, disabled, invalid, describedBy, onChange, onError }: ConfigFieldControlProps,
) {
	const [text, setText] = useState(() => formatText(field, value));
	const [shown, setShown] = useState(value);
	if (!sameValue(shown, value)) {
		// Changed from outside (the JSON editor, a discard, a refetch): show it, unless it is what the text already says.
		setShown(value);
		const parsed = parseConfigFieldText(field, text, before);
		if (parsed.error !== undefined || !sameValue(parsed.value, value)) {
			setText(formatText(field, value));
		}
	}

	const handleText = (next: string) => {
		setText(next);
		const parsed = parseConfigFieldText(field, next, before);
		if (parsed.error !== undefined) {
			onError(parsed.error);
			return;
		}
		onError(undefined);
		setShown(parsed.value);
		onChange(parsed.value);
	};

	const placeholder = value === undefined && field.harperDefault ? field.harperDefault : undefined;
	const common = {
		id: field.id,
		disabled,
		'aria-invalid': invalid || undefined,
		'aria-describedby': describedBy,
		placeholder,
	};
	if (field.kind === 'stringList') {
		return (
			<Textarea
				{...common}
				rows={Math.min(6, Math.max(2, text.split('\n').length))}
				className="font-mono text-xs"
				value={text}
				onChange={event => handleText(event.target.value)}
			/>
		);
	}
	const numeric = field.kind === 'integer' || field.kind === 'number';
	return (
		<Input
			{...common}
			inputMode={numeric ? 'decimal' : undefined}
			className={cn(numeric && 'font-mono')}
			value={text}
			onChange={event => handleText(event.target.value)}
		/>
	);
}

const NOT_SET = '';

export function ConfigFieldControl(props: ConfigFieldControlProps) {
	const { field, value, disabled, describedBy, onChange } = props;
	if (field.kind === 'boolean') {
		const checked = typeof value === 'boolean' ? value : field.harperDefault === 'true';
		return (
			<Switch
				id={field.id}
				checked={checked}
				disabled={disabled}
				aria-describedby={describedBy}
				onCheckedChange={next => onChange(next)}
			/>
		);
	}
	if (field.kind === 'enum') {
		const options = [...(field.enumValues ?? [])];
		if (typeof value === 'string' && !options.includes(value)) { options.unshift(value); }
		return (
			<select
				id={field.id}
				disabled={disabled}
				aria-describedby={describedBy}
				className="border-input h-9 w-full rounded-md border bg-white px-3 text-sm text-foreground dark:bg-grey-700 dark:text-white disabled:cursor-not-allowed disabled:opacity-50"
				value={typeof value === 'string' ? value : NOT_SET}
				onChange={event => onChange(event.target.value === NOT_SET ? undefined : event.target.value)}
			>
				{typeof value !== 'string' && (
					<option value={NOT_SET}>
						Not set{field.harperDefault ? ` (Harper uses ${field.harperDefault})` : ''}
					</option>
				)}
				{options.map(option => <option key={option} value={option}>{option}</option>)}
			</select>
		);
	}
	return <TextControl {...props} />;
}
