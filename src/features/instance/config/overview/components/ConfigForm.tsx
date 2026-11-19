import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { LockIcon, SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type ConfigChange, type ConfigObject, getIn, sameConfigValue } from '../configDraft';
import { describeConfigDuration, withDurationWords } from '../configDurations';
import type { ConfigFieldDef, ConfigGroupDef, ConfigSectionDef } from '../configSchemaFields';
import {
	describeFabricDefault,
	describeFabricSetSetting,
	type FabricContext,
	fabricDefaultFor,
	fabricSetSettingFor,
} from '../fabricManagedConfig';
import { ConfigFieldControl, fitsConfigField } from './ConfigFieldControl';

interface ConfigFormProps {
	sections: readonly ConfigSectionDef[];
	base: ConfigObject;
	draft: ConfigObject;
	changes: readonly ConfigChange[];
	context: FabricContext;
	disabled: boolean;
	errors: Readonly<Record<string, string>>;
	generation: number;
	onChange: (path: readonly string[], value: unknown) => void;
	onError: (path: readonly string[], message: string | undefined) => void;
}

export function formatConfigValue(value: unknown, path?: readonly string[]): string {
	if (value === undefined) { return 'not set'; }
	const formatted = typeof value === 'string' ? (value === '' ? '""' : value) : JSON.stringify(value);
	return path ? withDurationWords(path, value, formatted) : formatted;
}

function ConfigFieldRow({ field, base, draft, context, disabled, errors, onChange, onError }:
	& Omit<
		ConfigFormProps,
		'sections'
	>
	& { field: ConfigFieldDef })
{
	const value = getIn(draft, field.path);
	const before = getIn(base, field.path);
	const fabricSet = fabricSetSettingFor(field.path, context);
	const fabricDefault = fabricSet ? undefined : fabricDefaultFor(field.path, context);
	const changed = !sameConfigValue(value, before);
	const error = errors[field.path.join('.')];
	const noteId = `${field.id}-note`;
	const fits = fitsConfigField(field, value);
	const duration = describeConfigDuration(field.path, value);
	const harperDefault = field.harperDefault && withDurationWords(field.path, field.harperDefault, field.harperDefault);

	return (
		<div className="grid gap-3 border-b py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(12rem,20rem)] md:gap-8">
			<div className="min-w-0 space-y-1">
				<div className="flex flex-wrap items-center gap-2">
					<label htmlFor={field.id} className="text-sm font-medium">{field.label}</label>
					{fabricSet && (
						<Badge variant="outline">
							<LockIcon aria-hidden="true" /> Managed by Fabric
						</Badge>
					)}
					{fabricDefault && <Badge variant="outline">Fabric default</Badge>}
					{changed && <Badge variant="warning">Changed</Badge>}
				</div>
				<div id={noteId} className="space-y-1 text-sm text-muted-foreground">
					{field.description && <p>{field.description}</p>}
					<p className="text-xs">
						<code className="break-all">{field.path.join('.')}</code>
						{value === undefined
							? <>{' · '}Not set, so Harper uses {harperDefault || 'its default'}</>
							: harperDefault && <>{' · '}Harper default: {harperDefault}</>}
					</p>
					{fabricSet && <p className="text-xs">{describeFabricSetSetting(fabricSet)}</p>}
					{fabricDefault && <p className="text-xs">{describeFabricDefault(fabricDefault)}</p>}
					{changed && <p className="text-xs">Was {formatConfigValue(before, field.path)}.</p>}
				</div>
				{error && <p className="text-xs text-destructive">{error}</p>}
			</div>
			<div className="min-w-0">
				{fits
					? (
						<ConfigFieldControl
							field={field}
							value={value}
							before={before}
							disabled={disabled || !!fabricSet}
							invalid={!!error}
							describedBy={noteId}
							onChange={next => onChange(field.path, next)}
							onError={message => onError(field.path, message)}
						/>
					)
					: (
						<p className="text-xs text-muted-foreground">
							Set to{' '}
							<code className="break-all">{JSON.stringify(value)}</code>, which this form can't show. Change it in
							Advanced JSON.
						</p>
					)}
				{fits && duration && (
					<p
						className={cn(
							'mt-1 text-xs',
							duration.words ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400',
						)}
					>
						{duration.words ? `Harper reads this as ${duration.words}.` : "Harper can't read this as a duration."}
					</p>
				)}
			</div>
		</div>
	);
}

function ConfigGroup({ group, heading, ...props }: Omit<ConfigFormProps, 'sections'> & {
	group: ConfigGroupDef;
	heading?: string;
}) {
	const title = heading ?? group.label;
	return (
		<section aria-label={title} className="rounded-md border bg-card px-4">
			{title && (
				<header className="border-b py-3">
					<h4 className="text-sm font-semibold">{title}</h4>
					{group.description && <p className="text-xs text-muted-foreground">{group.description}</p>}
				</header>
			)}
			{group.fields.map(field => <ConfigFieldRow key={`${field.id}:${props.generation}`} field={field} {...props} />)}
		</section>
	);
}

function matchesQuery(field: ConfigFieldDef, query: string) {
	return [field.label, field.path.join('.'), field.description ?? ''].some(text => text.toLowerCase().includes(query));
}

export function ConfigForm({ sections, ...props }: ConfigFormProps) {
	const [selected, setSelected] = useState(sections[0]?.key);
	const [query, setQuery] = useState('');
	const normalizedQuery = query.trim().toLowerCase();
	const section = sections.find(candidate => candidate.key === selected) ?? sections[0];

	const changeCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const change of props.changes) {
			counts[change.path[0]] = (counts[change.path[0]] ?? 0) + 1;
		}
		return counts;
	}, [props.changes]);

	const results = useMemo(() => {
		if (!normalizedQuery) { return []; }
		return sections.flatMap(candidate =>
			candidate.groups
				.map(group => ({ ...group, fields: group.fields.filter(field => matchesQuery(field, normalizedQuery)) }))
				.filter(group => group.fields.length > 0)
				.map(group => ({
					group,
					heading: group.label ? `${candidate.label} › ${group.label}` : candidate.label,
				}))
		);
	}, [sections, normalizedQuery]);

	return (
		<div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-6">
			<div className="min-w-0 space-y-3">
				<div className="relative">
					<SearchIcon
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						type="search"
						aria-label="Find a setting"
						placeholder="Find a setting"
						className="pl-8"
						value={query}
						onChange={event => setQuery(event.target.value)}
					/>
				</div>
				<nav aria-label="Config sections">
					<ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
						{sections.map(candidate => {
							const current = !normalizedQuery && candidate.key === section?.key;
							const count = changeCounts[candidate.key] ?? 0;
							return (
								<li key={candidate.key} className="shrink-0">
									<button
										type="button"
										aria-current={current ? 'page' : undefined}
										className={cn(
											'flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm',
											current ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60',
										)}
										onClick={() => {
											setQuery('');
											setSelected(candidate.key);
										}}
									>
										{candidate.label}
										{count > 0 && (
											<Badge variant="warning" aria-label={`${count} changed`}>
												{count}
											</Badge>
										)}
									</button>
								</li>
							);
						})}
					</ul>
				</nav>
			</div>
			<div className="min-w-0 space-y-4">
				{normalizedQuery
					? (results.length > 0
						? results.map(({ group, heading }) => (
							<ConfigGroup key={group.path.join('.')} group={group} heading={heading} {...props} />
						))
						: (
							<p className="text-sm text-muted-foreground">
								No setting matches “{query.trim()}”. Advanced JSON has every setting.
							</p>
						))
					: section && (
						<>
							<div>
								<h3 className="text-base font-semibold">{section.label}</h3>
								{section.description && <p className="text-sm text-muted-foreground">{section.description}</p>}
							</div>
							{section.groups.map(group => <ConfigGroup key={group.path.join('.')} group={group} {...props} />)}
						</>
					)}
			</div>
		</div>
	);
}
