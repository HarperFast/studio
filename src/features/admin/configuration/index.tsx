import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateConfigurationMutation } from '@/features/admin/configuration/mutations/useUpdateConfiguration';
import { getConfigurationQueryOptions } from '@/features/admin/configuration/queries/getConfiguration';
import { useCloudAuth } from '@/hooks/useAuth';
import { AdminConfigurationEntry } from '@/integrations/api/api.patch';
import { describeError } from '@/react-query/queryClient';
import { useQuery } from '@tanstack/react-query';
import { LockIcon, PencilIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

export type ParsedValue = { ok: true; value: unknown } | { ok: false; error: string };

// JSON.parse turns 1e400 into Infinity, which serializes back as null, and rounds integers past 2^53.
function hasInexactNumber(value: unknown): boolean {
	if (typeof value === 'number') {
		return !Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value));
	}
	if (value && typeof value === 'object') { return Object.values(value).some(hasInexactNumber); }
	return false;
}

export function parseConfigValue(text: string): ParsedValue {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return { ok: false, error: `Not valid JSON: ${(error as Error).message}` };
	}
	if (hasInexactNumber(value)) {
		return { ok: false, error: 'A number is too large to save exactly.' };
	}
	return { ok: true, value };
}

export function jsonType(value: unknown): string {
	if (value === null) { return 'null'; }
	if (Array.isArray(value)) { return 'array'; }
	return typeof value;
}

function formatValue(value: unknown): string {
	return JSON.stringify(value) ?? 'undefined';
}

function EditConfigurationDialog(
	{ entry, onOpenChange }: { entry: AdminConfigurationEntry | null; onOpenChange: (open: boolean) => void },
) {
	const { mutate, isPending, error, reset } = useUpdateConfigurationMutation();
	const original = useMemo(() => JSON.stringify(entry?.value ?? null, null, 2), [entry]);
	const [text, setText] = useState(original);
	const parsed = parseConfigValue(text);
	const typeChanged = parsed.ok && entry != null && jsonType(parsed.value) !== jsonType(entry.value);
	const unchanged = parsed.ok && JSON.stringify(parsed.value) === JSON.stringify(entry?.value ?? null);

	// Not while a save is in flight: unmounting would drop its outcome, success or failure.
	const close = () => {
		if (isPending) { return; }
		reset();
		onOpenChange(false);
	};
	const save = () => {
		if (!entry || !parsed.ok) { return; }
		mutate({ name: entry.name, value: parsed.value }, { onSuccess: close });
	};

	return (
		<Dialog open={entry !== null} onOpenChange={(open) => (open ? onOpenChange(true) : close())}>
			<DialogContent className="max-w-2xl">
				<DialogTitle className="font-mono">{entry?.name}</DialogTitle>
				<DialogDescription>{entry?.description || 'No description.'}</DialogDescription>
				<Textarea
					value={text}
					onChange={(e) => {
						setText(e.target.value);
						if (error) { reset(); }
					}}
					aria-label="Value (JSON)"
					className="min-h-48 font-mono text-xs"
					spellCheck={false}
				/>
				{!parsed.ok && <p className="text-sm text-destructive">{parsed.error}</p>}
				{typeChanged && parsed.ok && (
					<p className="text-sm text-yellow-600 dark:text-yellow-400">
						This changes the value from {jsonType(entry?.value)} to{' '}
						{jsonType(parsed.value)}. Check that central-manager expects it.
					</p>
				)}
				{error && <p className="text-sm text-destructive">{describeError(error).message}</p>}
				<DialogFooter>
					<Button variant="outline" onClick={close} disabled={isPending}>Cancel</Button>
					<Button variant="submit" onClick={save} disabled={!parsed.ok || unchanged || isPending}>
						{isPending ? 'Saving…' : 'Save'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ConfigurationIndex() {
	const { data: entries, isLoading, isError } = useQuery(getConfigurationQueryOptions());
	const { user } = useCloudAuth();
	const isCoreSuperUser = user !== null && 'fabricRole' in user && user.fabricRole === 'super_user';
	const [search, setSearch] = useState('');
	const [editing, setEditing] = useState<AdminConfigurationEntry | null>(null);

	const visible = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) { return entries ?? []; }
		return (entries ?? []).filter((entry) =>
			entry.name.toLowerCase().includes(query) || (entry.description ?? '').toLowerCase().includes(query)
		);
	}, [entries, search]);

	return (
		<div>
			<h1 className="text-2xl font-light">Configuration</h1>
			<p className="mt-2 text-sm text-muted-foreground max-w-3xl">
				Central-manager settings. Changes take effect the next time central-manager reads the value. Keys marked with a
				lock guard access or credentials and can only be changed by the core super user.
			</p>

			<div className="mt-6">
				{isLoading
					? <p className="text-sm text-muted-foreground">Loading configuration…</p>
					: isError
					? <p className="text-sm text-destructive">Couldn't load configuration.</p>
					: (
						<>
							<Input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Filter by name or description…"
								aria-label="Filter configuration"
								className="mb-4 max-w-md"
							/>
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Value</TableHead>
											<TableHead className="w-0" />
										</TableRow>
									</TableHeader>
									<TableBody>
										{visible.map((entry) => {
											const editable = !entry.superUserOnly || isCoreSuperUser;
											return (
												<TableRow key={entry.name}>
													<TableCell className="align-top max-w-sm whitespace-normal">
														<div className="flex flex-col gap-1">
															<span className="inline-flex items-center gap-2 font-mono text-sm">
																{entry.name}
																{entry.superUserOnly && (
																	<Badge variant="secondary" className="text-[10px]">
																		<LockIcon />Super user
																	</Badge>
																)}
															</span>
															{entry.description && (
																<span className="text-xs text-muted-foreground">{entry.description}</span>
															)}
														</div>
													</TableCell>
													<TableCell className="align-top font-mono text-xs break-all max-w-md whitespace-normal">
														{formatValue(entry.value)}
													</TableCell>
													<TableCell className="align-top text-right">
														{editable && (
															<Button
																variant="ghost"
																size="icon"
																aria-label={`Edit ${entry.name}`}
																onClick={() => setEditing(entry)}
															>
																<PencilIcon />
															</Button>
														)}
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						</>
					)}
			</div>

			{/* Keyed so each open starts from the entry's current value. */}
			<EditConfigurationDialog
				key={editing?.name ?? 'closed'}
				entry={editing}
				onOpenChange={(open) => !open && setEditing(null)}
			/>
		</div>
	);
}
