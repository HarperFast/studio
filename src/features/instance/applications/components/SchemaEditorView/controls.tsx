/**
 * Small presentational building blocks shared by the schema editor's table and
 * field cards: a collapsible "advanced options" section and labelled
 * switch / text / number inputs. Kept declarative — all state lives in the
 * parent's document model.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToggler } from '@/hooks/useToggler';
import { cn } from '@/lib/cn';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { ReactNode, useId } from 'react';

/**
 * In dark mode `--card`, `--input`, and `--border` all resolve to grey-700, so a
 * default input is invisible inside a table card. Give schema-editor fields a
 * recessed darker fill and a lighter, visible border so they read as inputs.
 * (Light mode is unaffected — its grey border already separates white-on-white.)
 */
export const FIELD_SURFACE = 'dark:bg-grey-600 dark:border-grey-500';

export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
	const { toggled, toggle } = useToggler(false);
	return (
		<div className="mt-3">
			<button
				type="button"
				onClick={toggle}
				className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				{toggled ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
				{label}
			</button>
			{toggled && <div className="mt-2 pl-1">{children}</div>}
		</div>
	);
}

export function SwitchField({
	label,
	checked,
	onChange,
	disabled,
	description,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	description?: string;
}) {
	const id = useId();
	return (
		<div className="flex items-center gap-2">
			<Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
			<Label htmlFor={id} className={cn('font-normal', disabled && 'opacity-50')}>
				{label}
				{description && <span className="ml-1 text-xs text-muted-foreground italic">{description}</span>}
			</Label>
		</div>
	);
}

export function TextField({
	label,
	value,
	onChange,
	placeholder,
	disabled,
	invalid,
	error,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	invalid?: boolean;
	error?: string;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			<Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
			<Input
				id={id}
				type="text"
				className={FIELD_SURFACE}
				value={value}
				placeholder={placeholder}
				disabled={disabled}
				aria-invalid={invalid || undefined}
				onChange={event => onChange(event.target.value)}
			/>
			{error && <span className="text-xs text-destructive">{error}</span>}
		</div>
	);
}

export function NumberField({
	label,
	value,
	onChange,
	disabled,
	min,
}: {
	label: string;
	value: number | undefined;
	onChange: (value: number | undefined) => void;
	disabled?: boolean;
	min?: number;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			<Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
			<Input
				id={id}
				type="number"
				className={FIELD_SURFACE}
				min={min}
				step={1}
				value={value ?? ''}
				disabled={disabled}
				onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
			/>
		</div>
	);
}
