import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SettingChange, useSaveAgentSettingsMutation } from '@/features/admin/agent/agentAdminApi';
import { parseConfigValue } from '@/features/admin/configuration/index';
import { AdminConfigurationEntry } from '@/integrations/api/api.patch';
import { shouldToastOwnFailure } from '@/react-query/queryClient';
import { LockIcon } from 'lucide-react';
import { useState } from 'react';

type Kind = 'boolean' | 'number' | 'string' | 'json';

function kindOf(value: unknown): Kind {
	if (typeof value === 'boolean') { return 'boolean'; }
	if (typeof value === 'number') { return 'number'; }
	if (typeof value === 'string') { return 'string'; }
	return 'json';
}

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

type ParsedDraft = { ok: true; value: unknown } | { ok: false; error: string };

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

/** An edit in progress, pinned to the value it started from so a refetch never moves the concurrent-edit baseline. */
export interface SettingDraft {
	text: string | boolean;
	expected: unknown;
}
export type SettingDrafts = Record<string, SettingDraft>;

export function startDraft(entry: AdminConfigurationEntry, text: string | boolean): SettingDraft {
	return { text, expected: entry.value ?? null };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The changed keys only, each carrying the value its edit started from, so a concurrent edit is refused, not overwritten. */
export function changedSettings(
	settings: AdminConfigurationEntry[],
	drafts: SettingDrafts,
): { changes: SettingChange[]; errors: Record<string, string>; movedUnder: string[] } {
	const changes: SettingChange[] = [];
	const errors: Record<string, string> = {};
	const movedUnder: string[] = [];
	for (const entry of settings) {
		const draft = drafts[entry.name];
		if (!draft) { continue; }
		const parsed = parseDraft(kindOf(draft.expected), draft.text);
		// Already what the server holds (a save that landed without an answer): nothing to send, nothing to flag.
		if (parsed.ok && sameJson(parsed.value, entry.value)) { continue; }
		if (!sameJson(entry.value, draft.expected)) { movedUnder.push(entry.name); }
		if (!parsed.ok) {
			errors[entry.name] = parsed.error;
		} else if (!sameJson(parsed.value, draft.expected)) {
			changes.push({ name: entry.name, value: parsed.value, expected: draft.expected });
		}
	}
	return { changes, errors, movedUnder };
}

function SettingControl(
	{ entry, kind, draft, disabled, onChange }: {
		entry: AdminConfigurationEntry;
		kind: Kind;
		draft: string | boolean;
		disabled: boolean;
		onChange: (draft: string | boolean) => void;
	},
) {
	const label = entry.name;
	switch (kind) {
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
 * Drafts and the save, held by the page rather than the form: the Settings tab unmounts when another tab is shown,
 * and a save that settles after that must still clear the drafts it saved.
 */
export function useAgentSettingsEditor() {
	const [drafts, setDrafts] = useState<SettingDrafts>({});
	const save = useSaveAgentSettingsMutation({
		// A refused key keeps its draft so the operator sees what did not land.
		onSettledKeys: (saved) =>
			setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([name]) => !saved.includes(name)))),
	});
	return { drafts, setDrafts, save };
}
export type AgentSettingsEditor = ReturnType<typeof useAgentSettingsEditor>;

/**
 * The agent's Configuration rows as one form. Saves go through Admin → Configuration's write, one changed key at a
 * time, under its rules: config:write to edit at all, and a super-user-only key only for the core super user.
 */
export function AgentSettingsForm(
	{ settings, canWrite, isCoreSuperUser, editor }: {
		settings: AdminConfigurationEntry[];
		canWrite: boolean;
		isCoreSuperUser: boolean;
		editor: AgentSettingsEditor;
	},
) {
	const { drafts, setDrafts, save: { mutate, isPending, error, reset } } = editor;
	const { changes, errors, movedUnder } = changedSettings(settings, drafts);
	const canSave = canWrite && !isPending && changes.length > 0 && Object.keys(errors).length === 0;
	// Failures toast through the global handler; an unanswered one is only "outcome unknown", never someone else's edit.
	const unansweredKey = error && !shouldToastOwnFailure(error) ? (error as { failed?: string }).failed : undefined;

	if (settings.length === 0) {
		return <p className="text-sm text-muted-foreground">Central manager lists no agent settings.</p>;
	}

	const groups = new Map<string, AdminConfigurationEntry[]>();
	for (const entry of settings) {
		const group = settingGroup(entry.name);
		groups.set(group, [...(groups.get(group) ?? []), entry]);
	}
	const ordered = [...groups.entries()].sort(([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));

	const save = () => mutate(changes);

	return (
		<form
			aria-label="Agent settings"
			onSubmit={(event) => {
				event.preventDefault();
				if (canSave) { save(); }
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
								const draft = drafts[entry.name];
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
													kind={kindOf(draft ? draft.expected : entry.value)}
													draft={draft ? draft.text : draftOf(entry.value)}
													disabled={!editable || isPending}
													onChange={(next) =>
														setDrafts((current) => ({
															...current,
															[entry.name]: { ...(current[entry.name] ?? startDraft(entry, next)), text: next },
														}))}
												/>
											)}
										{movedUnder.includes(entry.name) && (
											<span className="text-xs text-yellow-600 dark:text-yellow-400">
												{unansweredKey === entry.name
													? 'Your last save got no answer and may have landed. Discard to see the current value.'
													: 'Changed by someone else since you started editing. Discard to see the current value.'}
											</span>
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
						disabled={!canSave}
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
							onClick={() => {
								setDrafts({});
								reset();
							}}
						>
							Discard
						</Button>
					)}
				</div>
			)}
		</form>
	);
}
