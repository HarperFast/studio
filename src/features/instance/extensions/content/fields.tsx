import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ExtensionRecord } from '@/features/instance/extensions/dataSource';
import type { ExtensionField } from '@/features/instance/extensions/manifest';

/** The fields of a record editor or settings form, drawn with Studio's own inputs. */
export function ExtensionFields({ fields, values, onChange, disabled, idPrefix }: {
	fields: ExtensionField[];
	values: ExtensionRecord;
	onChange: (attribute: string, value: unknown) => void;
	disabled?: boolean;
	idPrefix: string;
}) {
	return (
		<div className="grid gap-4">
			{fields.map((field) => {
				const id = `${idPrefix}-${field.attribute}`;
				return (
					<div key={field.attribute} className={field.input === 'switch' ? 'flex items-center gap-3' : 'grid gap-1.5'}>
						{field.input === 'switch'
							? (
								<>
									<Switch
										id={id}
										checked={values[field.attribute] === true}
										onCheckedChange={(checked) => onChange(field.attribute, checked)}
										disabled={disabled}
									/>
									<Label htmlFor={id}>{field.label}</Label>
								</>
							)
							: (
								<>
									<Label htmlFor={id}>
										{field.label}
										{field.required && <span className="text-muted-foreground">*</span>}
									</Label>
									<FieldControl
										id={id}
										field={field}
										value={values[field.attribute]}
										onChange={onChange}
										disabled={disabled}
									/>
								</>
							)}
						{field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
					</div>
				);
			})}
		</div>
	);
}

function FieldControl({ id, field, value, onChange, disabled }: {
	id: string;
	field: ExtensionField;
	value: unknown;
	onChange: (attribute: string, value: unknown) => void;
	disabled?: boolean;
}) {
	switch (field.input) {
		case 'textarea':
			return (
				<Textarea
					id={id}
					value={stringValue(value)}
					placeholder={field.placeholder}
					disabled={disabled}
					onChange={(event) => onChange(field.attribute, event.target.value)}
				/>
			);
		case 'select': {
			const options = field.options ?? [];
			return (
				<Select
					value={value === undefined ? undefined : String(value)}
					disabled={disabled}
					// Option values keep their declared type: a numeric status code stays a number in the record.
					onValueChange={(next) =>
						onChange(field.attribute, options.find((option) => String(option.value) === next)?.value ?? next)}
				>
					<SelectTrigger id={id} className="w-full">
						<SelectValue placeholder={field.placeholder ?? 'Choose…'} />
					</SelectTrigger>
					<SelectContent>
						{options.map((option) => (
							<SelectItem key={String(option.value)} value={String(option.value)}>{option.label}</SelectItem>
						))}
					</SelectContent>
				</Select>
			);
		}
		default:
			return (
				<Input
					id={id}
					type={field.input === 'number' ? 'number' : field.input === 'url' ? 'url' : 'text'}
					value={stringValue(value)}
					placeholder={field.placeholder}
					required={field.required}
					disabled={disabled}
					onChange={(event) =>
						onChange(
							field.attribute,
							field.input === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value,
						)}
				/>
			);
	}
}

function stringValue(value: unknown): string {
	return value === undefined || value === null ? '' : String(value);
}

/** The first required field left empty, for the inline error. */
export function findMissingField(fields: ExtensionField[], values: ExtensionRecord): ExtensionField | undefined {
	return fields.find((field) =>
		field.required && (values[field.attribute] === undefined || values[field.attribute] === '')
	);
}

export function defaultValues(fields: ExtensionField[]): ExtensionRecord {
	return Object.fromEntries(
		fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.attribute, field.defaultValue]),
	);
}
