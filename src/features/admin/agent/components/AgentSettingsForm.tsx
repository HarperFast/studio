import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SettingChange, useSaveAgentSettingsMutation } from '@/features/admin/agent/agentAdminApi';
import { parseConfigValue } from '@/features/admin/configuration/index';
import { AdminConfigurationEntry } from '@/integrations/api/api.patch';
import { describeError } from '@/react-query/queryClient';
import { LockIcon } from 'lucide-react';
import { useState } from 'react';

type Kind = 'boolean' | 'number' | 'string' | 'json';

function kindOf(value: unknown): Kind {
	if (typeof value === 'boolean') { return 'boolean'; }
	if (typeof value === 'number') { return 'number'; }
	if (typeof value === 'string') { return 'string'; }
	return 'json';
}

/** The text a draft starts from; a boolean's draft is the value itself. */
function draftOf(value: unknown): string | boolean {
	switch (kindOf(value)) {
		case 'boolean':
			return value as boolean;
		case 'number':
			return String(value);
		case 'string':
			return value as string;
		default:
			return JSON.stringify(value ?? null, null, 2);
	}
}

export type ParsedDraft = { ok: true; value: unknown } | { ok: false; error: string };

/** Read a draft back as the value its row's current type expects. */
export function parseDraft(kind: Kind, draft: string | boolean): ParsedDraft {
	if (kind === 'boolean') { return { ok: true, value: draft === true }; }
	const text = String(draft);
	if (kind === 'string') { return { ok: true, value: text }; }
	if (kind === 'number') {
		const number = text.trim() === '' ? Number.NaN : Number(text);
		return Number.isFinite(number) ? { ok: true, value: number } : { ok: false, error: 'Enter a number.' };
	}
	const parsed = parseConfigValue(text);
	return parsed.ok ? { ok: true, value: parsed.value } : { ok: false, error: parsed.error };
}

/** Grouped by what a key's name says it is, so a key the server adds lands in a group without a change here. */
export function settingGroup(name: string): string {
	if (/SLACK/.test(name)) { return 'Slack'; }
	if (name.endsWith('_URL')) { return 'Data sources'; }
	if (/BUDGET|_USD/.test(name)) { return 'Budgets'; }
	if (name.endsWith('ENABLED')) { return 'Switches'; }
	return 'Other';
}
const GROUP_ORDER = ['Switches', 'Budgets', 'Other', 'Slack', 'Data sources'];

/** Listed by the server with no row behind it: Admin → Configuration can't edit it either, so neither can this. */
const isMissingRow = (entry: AdminConfigurationEntry) =>
	entry.value === null && (entry.description === null || entry.description === undefined);

/** The changed keys only, each carrying the value it was read with, so a concurrent edit is refused, not overwritten. */
export function changedSettings(
	settings: AdminConfigurationEntry[],
	drafts: Record<string, string | boolean>,
): { changes: SettingChange[]; errors: Record<string, string> } {
	const changes: SettingChange[] = [];
	const errors: Record<string, string> = {};
	for (const entry of settings) {
		if (!(entry.name in drafts)) { continue; }
		const parsed = parseDraft(kindOf(entry.value), drafts[entry.name]);
		if (!parsed.ok) {
			errors[entry.name] = parsed.error;
		} else if (JSON.stringify(parsed.value) !== JSON.stringify(entry.value ?? null)) {
			changes.push({ name: entry.name, value: parsed.value, expected: entry.value ?? null });
		}
	}
	return { changes, errors };
}

function SettingControl(
	{ entry, draft, disabled, onChange }: {
		entry: AdminConfigurationEntry;
		draft: string | boolean;
		disabled: boolean;
		onChange: (draft: string | boolean) => void;
	},
) {
	const label = entry.name;
	switch (kindOf(entry.value)) {
		case 'boolean':
			return <Switch checked={draft === true} disabled={disabled} aria-label={label} onCheckedChange={onChange} />;
		case 'number':
			return (
				<Input
					type="number"
					inputMode="decimal"
					step="any"
					value={String(draft)}
					disabled={disabled}
					aria-label={label}
					onChange={(e) => onChange(e.target.value)}
					className="w-40"
				/>
			);
		case 'string':
			return (
				<Input
					value={String(draft)}
					disabled={disabled}
					aria-label={label}
					onChange={(e) => onChange(e.target.value)}
					className="max-w-xl"
				/>
			);
		default:
			return (
				<Textarea
					value={String(draft)}
					disabled={disabled}
					aria-label={`${label} (JSON)`}
					onChange={(e) => onChange(e.target.value)}
					className="min-h-24 max-w-xl font-mono text-xs"
					spellCheck={false}
				/>
			);
	}
}

/**
 * The agent's Configuration rows as one form. Saves go through Admin → Configuration's write, one changed key at a
 * time, under its rules: config:write to edit at all, and a super-user-only key only for the core super user.
 */
export function AgentSettingsForm(
	{ settings, canWrite, isCoreSuperUser }: {
		settings: AdminConfigurationEntry[];
		canWrite: boolean;
		isCoreSuperUser: boolean;
	},
) {
	const [drafts, setDrafts] = useState<Record<string, string | boolean>>({});
	const { mutate, isPending, error } = useSaveAgentSettingsMutation();
	const { changes, errors } = changedSettings(settings, drafts);

	if (settings.length === 0) {
		return <p className="text-sm text-muted-foreground">Central manager lists no agent settings.</p>;
	}

	const groups = new Map<string, AdminConfigurationEntry[]>();
	for (const entry of settings) {
		const group = settingGroup(entry.name);
		groups.set(group, [...(groups.get(group) ?? []), entry]);
	}
	const ordered = [...groups.entries()].sort(([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));

	const save = () => {
		mutate(changes, {
			// Saved keys drop their drafts; a refused one keeps its draft so the operator can see what didn't land.
			onSettled: (saved, failure) => {
				const done = saved ?? (failure as { saved?: string[] } | null)?.saved ?? [];
				setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([name]) => !done.includes(name))));
			},
		});
	};

	return (
		<form
			aria-label="Agent settings"
			onSubmit={(event) => {
				event.preventDefault();
				save();
			}}
		>
			{!canWrite && (
				<p className="mb-4 text-sm text-muted-foreground">Changing these needs the config:write permission.</p>
			)}
			<div className="space-y-6">
				{ordered.map(([group, entries]) => (
					<fieldset key={group} className="rounded-xl border p-4">
						<legend className="px-1 text-sm font-medium">{group}</legend>
						<div className="space-y-4">
							{entries.map((entry) => {
								const missing = isMissingRow(entry);
								const editable = canWrite && !missing && (!entry.superUserOnly || isCoreSuperUser);
								const draft = drafts[entry.name] ?? draftOf(entry.value);
								return (
									<div key={entry.name} className="flex flex-col gap-1.5">
										<span className="inline-flex items-center gap-2 font-mono text-sm">
											{entry.name}
											{entry.superUserOnly && (
												<Badge variant="secondary" className="text-[10px]">
													<LockIcon />Super user
												</Badge>
											)}
										</span>
										{entry.description && <span className="text-xs text-muted-foreground">{entry.description}</span>}
										{missing
											? (
												<span className="text-xs text-muted-foreground">
													Not set: there is no Configuration row for this key.
												</span>
											)
											: (
												<SettingControl
													entry={entry}
													draft={draft}
													disabled={!editable || isPending}
													onChange={(next) => setDrafts((current) => ({ ...current, [entry.name]: next }))}
												/>
											)}
										{errors[entry.name] && <span className="text-xs text-destructive">{errors[entry.name]}</span>}
									</div>
								);
							})}
						</div>
					</fieldset>
				))}
			</div>
			{canWrite && (
				<div className="mt-4 flex flex-wrap items-center gap-3">
					<Button
						type="submit"
						variant="submit"
						disabled={isPending || changes.length === 0 || Object.keys(errors).length > 0}
					>
						{isPending
							? 'Saving…'
							: changes.length
							? `Save ${changes.length} change${changes.length === 1 ? '' : 's'}`
							: 'Save'}
					</Button>
					{Object.keys(drafts).length > 0 && (
						<Button
							type="button"
							variant="outline"
							disabled={isPending}
							onClick={() => setDrafts({})}
						>
							Discard
						</Button>
					)}
					{error && <span role="alert" className="text-sm text-destructive">{describeError(error).message}</span>}
				</div>
			)}
		</form>
	);
}
