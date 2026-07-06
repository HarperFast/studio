/**
 * Editor for one `@table` type: a collapsible card whose header shows the table
 * name and a quick summary, and whose body holds the name, REST/`@sealed`
 * toggles, common `@table` options (database, expiration), an advanced
 * disclosure for the rest of the `@table`/`@export` arguments, and the list of
 * {@link FieldRow}s. Unknown type-level directives are surfaced read-only so
 * they're visibly preserved.
 */
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { GRAPHQL_NAME_HINT, isValidGraphqlName } from '@/features/instance/applications/lib/schema/graphqlName';
import {
	createField,
	getArgValue,
	hasDirective,
	setBoolArg,
	setDirectivePresent,
	setIntArg,
	setStringArg,
} from '@/features/instance/applications/lib/schema/mutations';
import {
	boolArgValue,
	Directive,
	intArgValue,
	stringArgValue,
	TableModel,
} from '@/features/instance/applications/lib/schema/types';
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { Disclosure, NumberField, SwitchField, TextField } from './controls';
import { FieldRow } from './FieldRow';

const KNOWN_TABLE_DIRECTIVES = new Set(['table', 'export', 'sealed']);

export function TableCard({
	table,
	typeNames,
	readOnly,
	defaultCollapsed,
	onChange,
	onRemove,
}: {
	table: TableModel;
	typeNames: string[];
	readOnly: boolean;
	/** Existing tables open collapsed; freshly-added ones open expanded for editing. */
	defaultCollapsed: boolean;
	onChange: (table: TableModel) => void;
	onRemove: () => void;
}) {
	const [collapsed, setCollapsed] = useState(defaultCollapsed);

	const setDirectives = (directives: Directive[]) => onChange({ ...table, directives });
	const togglePresent = (name: string, present: boolean) =>
		setDirectives(setDirectivePresent(table.directives, name, present));
	const setStr = (dir: string, arg: string, text: string) =>
		setDirectives(setStringArg(table.directives, dir, arg, text));
	const setNum = (dir: string, arg: string, value: number | undefined) =>
		setDirectives(setIntArg(table.directives, dir, arg, value));
	const setBool = (dir: string, arg: string, value: boolean, defaultValue: boolean) =>
		setDirectives(setBoolArg(table.directives, dir, arg, value, defaultValue));
	const str = (dir: string, arg: string) => stringArgValue(getArgValue(table.directives, dir, arg)) ?? '';
	const num = (dir: string, arg: string) => intArgValue(getArgValue(table.directives, dir, arg));
	const bool = (dir: string, arg: string, fallback: boolean) =>
		boolArgValue(getArgValue(table.directives, dir, arg)) ?? fallback;

	const exported = hasDirective(table.directives, 'export');
	const nameError = table.typeName && !isValidGraphqlName(table.typeName) ? GRAPHQL_NAME_HINT : undefined;
	const preserved = table.directives.filter(directive => !KNOWN_TABLE_DIRECTIVES.has(directive.name));
	const fieldCount = table.fields.length;

	return (
		<Card>
			<CardContent className="flex flex-col gap-4">
				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={() => setCollapsed(value => !value)}
						aria-expanded={!collapsed}
						className="flex flex-1 items-center gap-2 text-left"
					>
						{collapsed
							? <ChevronRightIcon className="size-4 shrink-0" />
							: <ChevronDownIcon className="size-4 shrink-0" />}
						<span className="font-medium">
							{table.typeName || <span className="text-muted-foreground italic">Untitled table</span>}
						</span>
						<span className="text-xs text-muted-foreground">
							{fieldCount} field{fieldCount === 1 ? '' : 's'}
							{exported ? ' · REST' : ''}
							{nameError ? ' · ⚠ invalid name' : ''}
						</span>
					</button>
					<Button
						type="button"
						variant="destructiveGhost"
						size="sm"
						className="rounded-full"
						disabled={readOnly}
						onClick={onRemove}
					>
						<TrashIcon /> Remove table
					</Button>
				</div>

				{!collapsed && (
					<>
						<TextField
							label="Table (type) name"
							value={table.typeName}
							disabled={readOnly}
							invalid={!!nameError}
							error={nameError}
							onChange={typeName => onChange({ ...table, typeName })}
						/>

						<div className="flex flex-wrap gap-x-6 gap-y-2">
							<SwitchField
								label="REST endpoint"
								description="@export"
								checked={exported}
								disabled={readOnly}
								onChange={value => togglePresent('export', value)}
							/>
							<SwitchField
								label="Sealed"
								description="reject undefined properties"
								checked={hasDirective(table.directives, 'sealed')}
								disabled={readOnly}
								onChange={value => togglePresent('sealed', value)}
							/>
						</div>

						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							<TextField
								label="Database"
								placeholder="data"
								value={str('table', 'database')}
								disabled={readOnly}
								onChange={value => setStr('table', 'database', value)}
							/>
							<NumberField
								label="Expiration (seconds, 0 = never)"
								value={num('table', 'expiration')}
								min={0}
								disabled={readOnly}
								onChange={value => setNum('table', 'expiration', value)}
							/>
						</div>

						<Disclosure label="Advanced table options">
							<div className="flex flex-col gap-4">
								<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
									<TextField
										label="Table name override (@table table:)"
										placeholder={table.typeName || 'defaults to type name'}
										value={str('table', 'table')}
										disabled={readOnly}
										onChange={value => setStr('table', 'table', value)}
									/>
									<NumberField
										label="Eviction (seconds after expiration)"
										value={num('table', 'eviction')}
										min={0}
										disabled={readOnly}
										onChange={value => setNum('table', 'eviction', value)}
									/>
									<NumberField
										label="Scan interval (seconds)"
										value={num('table', 'scanInterval')}
										min={0}
										disabled={readOnly}
										onChange={value => setNum('table', 'scanInterval', value)}
									/>
								</div>
								<div className="flex flex-wrap gap-x-6 gap-y-2">
									<SwitchField
										label="Audit"
										checked={bool('table', 'audit', false)}
										disabled={readOnly}
										onChange={value => setBool('table', 'audit', value, false)}
									/>
									<SwitchField
										label="Replicate"
										checked={bool('table', 'replicate', true)}
										disabled={readOnly}
										onChange={value => setBool('table', 'replicate', value, true)}
									/>
									<SwitchField
										label="Random-access fields"
										checked={bool('table', 'randomAccessFields', false)}
										disabled={readOnly}
										onChange={value => setBool('table', 'randomAccessFields', value, false)}
									/>
								</div>
								{exported && (
									<div className="flex flex-col gap-3 border-l-2 pl-3">
										<div className="text-xs font-medium text-muted-foreground">REST endpoint (@export) options</div>
										<TextField
											label="Endpoint name override"
											placeholder={table.typeName || 'defaults to type name'}
											value={str('export', 'name')}
											disabled={readOnly}
											onChange={value => setStr('export', 'name', value)}
										/>
										<div className="flex flex-wrap gap-x-6 gap-y-2">
											<SwitchField
												label="REST"
												checked={bool('export', 'rest', true)}
												disabled={readOnly}
												onChange={value => setBool('export', 'rest', value, true)}
											/>
											<SwitchField
												label="MQTT"
												checked={bool('export', 'mqtt', true)}
												disabled={readOnly}
												onChange={value => setBool('export', 'mqtt', value, true)}
											/>
										</div>
									</div>
								)}
								{preserved.length > 0 && (
									<div className="text-xs text-muted-foreground">
										Preserved directives:{' '}
										{preserved.map(directive => <code key={directive.name} className="mr-1">@{directive.name}</code>)}
									</div>
								)}
							</div>
						</Disclosure>

						<div>
							<h4 className="mb-2 text-sm font-medium">Fields</h4>
							<div className="flex flex-col gap-2">
								{table.fields.map((field, index) => (
									<FieldRow
										key={index}
										field={field}
										typeNames={typeNames}
										readOnly={readOnly}
										onChange={next =>
											onChange({ ...table, fields: table.fields.map((f, i) => i === index ? next : f) })}
										onRemove={() => onChange({ ...table, fields: table.fields.filter((_, i) => i !== index) })}
									/>
								))}
							</div>
							<Button
								type="button"
								variant="ghost"
								className="mt-2 w-full"
								disabled={readOnly}
								onClick={() => onChange({ ...table, fields: [...table.fields, createField()] })}
							>
								<PlusIcon /> Add field
							</Button>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
