import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radioGroup';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getDescribeAllQueryOptions } from '@/integrations/api/instance/database/getDescribeAll';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { PrivateCopyMode, PrivateCopyValue } from './privateCopyValue';

const MODES: { value: PrivateCopyMode; title: string; description: string }[] = [
	{ value: 'off', title: 'Off', description: 'The application uses the shared databases.' },
	{
		value: 'all',
		title: 'All databases',
		description:
			'Every database except system. One created while the application runs is copied only when it next loads.',
	},
	{ value: 'chosen', title: 'Chosen databases', description: 'Only the databases you pick.' },
];

export function PrivateDatabaseCopyField({
	value,
	onChange,
	idPrefix,
}: {
	value: PrivateCopyValue;
	onChange: (value: PrivateCopyValue) => void;
	idPrefix: string;
}) {
	const instanceParams = useInstanceClientIdParams();
	const { data: describeAll, isPending, isError } = useQuery({
		...getDescribeAllQueryOptions({ ...instanceParams, skipRecordCount: true }),
		enabled: value.mode === 'chosen',
	});
	// A chosen database that no longer exists stays listed, so it can be seen and unchecked; Harper refuses it.
	const databases = useMemo(() => {
		const names = new Set(Object.keys(describeAll ?? {}).filter(name => name !== 'system'));
		value.databases.forEach(name => names.add(name));
		return [...names].sort((a, b) => a.localeCompare(b));
	}, [describeAll, value.databases]);

	const toggleDatabase = (name: string, checked: boolean) => {
		const rest = value.databases.filter(database => database !== name);
		onChange({ ...value, databases: checked ? [...rest, name] : rest });
	};

	return (
		<FormItem>
			<FormLabel>Private database copy</FormLabel>
			<FormDescription>
				Run this application on its own copy of its data, so it can be tested without touching the shared databases.
			</FormDescription>
			<FormControl>
				<RadioGroup
					value={value.mode}
					onValueChange={mode => onChange({ ...value, mode: mode as PrivateCopyMode })}
					className="gap-2"
				>
					{MODES.map(mode => (
						<Label
							key={mode.value}
							htmlFor={`${idPrefix}-private-copy-${mode.value}`}
							className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer font-normal hover:bg-accent/50 has-[[data-state=checked]]:border-primary"
						>
							<RadioGroupItem value={mode.value} id={`${idPrefix}-private-copy-${mode.value}`} className="mt-0.5" />
							<span className="grid gap-1">
								<span className="font-medium">{mode.title}</span>
								<span className="text-sm text-muted-foreground">{mode.description}</span>
							</span>
						</Label>
					))}
				</RadioGroup>
			</FormControl>
			{value.mode === 'chosen' && (
				<fieldset className="grid gap-2 pl-1">
					<legend className="sr-only">Databases to copy</legend>
					{isError && <p className="text-sm text-warning">Studio couldn&apos;t list the databases.</p>}
					{isPending && <p className="text-sm text-muted-foreground">Loading databases…</p>}
					{!isPending && !isError && databases.length === 0 && (
						<p className="text-sm text-muted-foreground">There are no databases to copy besides system.</p>
					)}
					{databases.map(name => (
						<div key={name} className="flex items-center gap-2">
							<Input
								type="checkbox"
								id={`${idPrefix}-private-copy-db-${name}`}
								className="w-4 h-4 cursor-pointer"
								checked={value.databases.includes(name)}
								onChange={event => toggleDatabase(name, event.target.checked)}
							/>
							<Label htmlFor={`${idPrefix}-private-copy-db-${name}`} className="cursor-pointer font-normal">
								{name}
							</Label>
						</div>
					))}
				</fieldset>
			)}
			<FormMessage />
			{value.mode !== 'off' && <PrivateCopyNotes cluster={instanceParams.entityType === 'cluster'} />}
		</FormItem>
	);
}

function PrivateCopyNotes({ cluster }: { cluster: boolean }) {
	return (
		<ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
			<li>
				Harper copies the data once, the first time the application loads with this on. After that its writes stay in
				the copy, and later changes to the shared databases don&apos;t reach it.
			</li>
			{cluster && (
				<li>
					Each node keeps its own copy, and the copies aren&apos;t replicated, so the application&apos;s data can differ
					depending on which node answers.
				</li>
			)}
			<li>
				The application reaches its copy only through{' '}
				<code>import {'{ databases }'} from &apos;harper&apos;</code>. Code that uses the <code>databases</code> or{' '}
				<code>tables</code> globals still reads and writes the shared data.
			</li>
			<li>
				Turning this off puts the application back on the shared data. Its copy stays on disk, and turning it on again
				picks that copy up rather than taking a new one.
			</li>
		</ul>
	);
}
