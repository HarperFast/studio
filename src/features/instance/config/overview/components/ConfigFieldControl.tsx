import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import { useEffect, useRef, useState } from 'react';
import { sameConfigValue } from '../configDraft';
import { isDurationSetting } from '../configDurations';
import type { ConfigFieldDef } from '../configSchemaFields';

interface ConfigFieldControlProps {
	field: ConfigFieldDef;
	value: unknown;
	before: unknown;
	disabled: boolean;
	invalid: boolean;
	describedBy?: string;
	onChange: (value: unknown) => void;
	onError: (message: string | undefined) => void;
}

type Parsed = { value: unknown; error?: undefined } | { value?: undefined; error: string };

export function fitsConfigField(field: ConfigFieldDef, value: unknown): boolean {
	if (value === undefined || (value === null && field.nullable)) { return true; }
	switch (field.kind) {
		case 'boolean':
			return typeof value === 'boolean';
		case 'enum':
			return typeof value === 'string';
		case 'string':
		case 'stringOrNumber':
			// Harper stores text that reads as a number or a boolean as one (`storedByHarper`).
			return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
		case 'integer':
		case 'number':
			return typeof value === 'number';
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

function parseEmpty(field: ConfigFieldDef, before: unknown): Parsed {
	if (before === undefined) { return { value: undefined }; }
	if (field.kind === 'stringList') {
		// A list with no origins in it, Harper's `[null]` included, is what an empty box shows: clearing it restores it.
		if (Array.isArray(before) && !before.some(item => typeof item === 'string')) { return { value: before }; }
		return { value: Array.isArray(before) || !field.nullable ? [] : null };
	}
	if (field.nullable) { return { value: null }; }
	// An empty duration is one Harper can't read, which for a token timeout means no token can be issued.
	if (isDurationSetting(field.path)) { return { error: 'Enter a duration, such as 1d.' }; }
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
	if (field.kind === 'string') { return { value: trimmed }; }
	if (field.kind === 'stringOrNumber') {
		return { value: Number.isFinite(Number(trimmed)) ? Number.parseFloat(trimmed) : trimmed };
	}
	const number = Number(trimmed);
	if (!Number.isFinite(number)) { return { error: 'Enter a number.' }; }
	if (field.kind === 'integer' && !Number.isInteger(number)) { return { error: 'Enter a whole number.' }; }
	if (field.minimum !== undefined && number < field.minimum) { return { error: `Enter ${field.minimum} or more.` }; }
	if (field.maximum !== undefined && number > field.maximum) { return { error: `Enter ${field.maximum} or less.` }; }
	return { value: number };
}

function TextControl(
	{ field, value, before, disabled, invalid, describedBy, onChange, onError }: ConfigFieldControlProps,
) {
	const [text, setText] = useState(() => formatText(field, value));
	const [shown, setShown] = useState(value);
	if (!sameConfigValue(shown, value)) {
		setShown(value);
		const parsed = parseConfigFieldText(field, text, before);
		if (parsed.error !== undefined || !sameConfigValue(parsed.value, value)) {
			setText(formatText(field, value));
		}
	}

	// The error follows the text on screen, and goes when the field does, so it never outlives what it describes.
	const error = parseConfigFieldText(field, text, before).error;
	const onErrorRef = useRef(onError);
	onErrorRef.current = onError;
	useEffect(() => {
		onErrorRef.current(error);
	}, [error]);
	useEffect(() => () => onErrorRef.current(undefined), []);

	const handleText = (next: string) => {
		setText(next);
		const parsed = parseConfigFieldText(field, next, before);
		if (parsed.error === undefined) {
			setShown(parsed.value);
			onChange(parsed.value);
		}
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

/** Radix Select reserves the empty string. */
const NOT_SET = '__not-set__';

export function ConfigFieldControl(props: ConfigFieldControlProps) {
	const { field, value, before, disabled, describedBy, onChange } = props;
	if (field.kind === 'boolean') {
		const byDefault = field.harperDefault === 'true';
		const checked = typeof value === 'boolean' ? value : byDefault;
		return (
			<Switch
				id={field.id}
				checked={checked}
				disabled={disabled}
				aria-describedby={describedBy}
				// Switched back to what Harper does unset, an unset setting goes back to unset.
				onCheckedChange={next => onChange(before === undefined && next === byDefault ? undefined : next)}
			/>
		);
	}
	if (field.kind === 'enum') {
		const options = [...(field.enumValues ?? [])];
		if (typeof value === 'string' && !options.includes(value)) { options.unshift(value); }
		// Offered while unset, and after picking a value for a setting that was unset, so it can go back.
		const offersNotSet = typeof value !== 'string' || before === undefined;
		return (
			<Select
				value={typeof value === 'string' ? value : NOT_SET}
				disabled={disabled}
				onValueChange={next => onChange(next === NOT_SET ? undefined : next)}
			>
				<SelectTrigger id={field.id} aria-describedby={describedBy} className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{offersNotSet && (
						<SelectItem value={NOT_SET}>
							Not set{field.harperDefault ? ` (Harper uses ${field.harperDefault})` : ''}
						</SelectItem>
					)}
					{options.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
				</SelectContent>
			</Select>
		);
	}
	return <TextControl {...props} />;
}
