import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OPERATION_CATEGORIES } from '@/features/instance/config/roles/operations/operationsCatalog';
import { OperationsPicker } from '@/features/instance/config/roles/operations/OperationsPicker';
import {
	agentSharesMcpOperationsList,
	isMcpDefaultOnlyExclusion,
	isMcpOperationIncluded,
	McpCommandList,
	McpStoredList,
	writeMcpCommandList,
} from '@/integrations/api/instance/mcp/mcpConfig';
import { pluralize } from '@/lib/pluralize';
import { RotateCcwIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
	addMcpCommand,
	dropAddedMcpEntry,
	includedMcpCommands,
	isDefaultMcpCommand,
	isMcpPattern,
	knownMcpCommands,
	McpCommand,
	OTHER_CATEGORY,
	removeMcpCommand,
	restoreMcpCommand,
} from './mcpCommands';

const CATEGORIES = [...OPERATION_CATEGORIES, OTHER_CATEGORY];

/** A command name, or a `*` pattern as Harper's allow and deny lists take them. */
const ENTRY_PATTERN = /^[A-Za-z*][A-Za-z0-9_.:*-]*$/;

const CHANGES_DATA_TITLE = 'This command can change or delete data, or change the instance.';

export function McpCommandsEditor({
	list,
	saved,
	onChange,
	version,
	disabled,
}: {
	list: McpCommandList;
	saved: McpStoredList;
	onChange: (next: McpCommandList) => void;
	version: string;
	disabled?: boolean;
}) {
	const known = knownMcpCommands(version, list);
	const included = includedMcpCommands(version, list);
	const includedNames = new Set(included.map((command) => command.name));
	const changesData = included.filter((command) => command.changesData);
	const addedPatterns = list.added.filter(isMcpPattern);

	const stored = writeMcpCommandList(list);
	// Exposed today only because the list was written without Studio's exclusions; saving takes them out.
	const servedNow = known.filter((command) =>
		isMcpDefaultOnlyExclusion(command.name) && isMcpOperationIncluded(command.name, saved)
		&& !includedNames.has(command.name)
	);

	// By what the list gives, not by the catalog: a name only a pattern covers is in, and picking it takes it out.
	const toggle = (name: string) =>
		onChange(isMcpOperationIncluded(name, stored) ? removeMcpCommand(list, name) : addMcpCommand(list, name));

	const customCandidate = (query: string) => {
		const lower = query.toLowerCase();
		const listed = [...known.map((command) => command.name), ...list.added, ...list.removed]
			.some((name) => name.toLowerCase() === lower);
		if (!ENTRY_PATTERN.test(query) || listed) {
			return undefined;
		}
		const covered = isMcpOperationIncluded(query, stored);
		const entry = <span className="font-mono">{query}</span>;
		return {
			name: query,
			label: isMcpPattern(query)
				? <>{covered ? 'Remove' : 'Add'} every command whose name matches "{entry}"</>
				: covered
				? <>Remove "{entry}" (a pattern includes it)</>
				: <>Add "{entry}" (a command Studio doesn't list, such as one a component adds)</>,
		};
	};

	return (
		<div className="flex flex-col gap-3">
			<div>
				<h4 className="text-sm font-medium">Commands</h4>
				<p className="text-xs text-muted-foreground">
					Each command is a tool an AI tool can call. Harper's default set is read-only. Adding a command keeps the
					defaults, and removing one takes it out of the default set.
				</p>
			</div>

			{!list.includesDefaults && (
				<div className="flex flex-wrap items-center gap-2 rounded-md border border-yellow p-2 text-xs">
					<span className="flex-1">
						This list was set outside Studio and leaves out some of Harper's default read-only commands.
					</span>
					<Button
						type="button"
						size="sm"
						variant="defaultOutline"
						disabled={disabled}
						onClick={() => onChange({ ...list, includesDefaults: true })}
					>
						Add the defaults
					</Button>
				</div>
			)}

			<OperationsPicker<McpCommand>
				operations={known}
				categories={CATEGORIES}
				selected={includedNames}
				onToggle={toggle}
				customCandidate={customCandidate}
				triggerLabel="Add or remove commands…"
				disabled={disabled}
				renderBadge={(command) =>
					command.changesData && <Badge variant="warning" title={CHANGES_DATA_TITLE}>changes data</Badge>}
			/>

			<div>
				<p className="mb-1 text-xs text-muted-foreground">
					Includes {pluralize(included.length, 'command', 'commands')} Studio knows
					{list.includesDefaults || addedPatterns.length > 0
						? ', and any other whose name matches an entry, such as one a component adds'
						: ''}:
				</p>
				<div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
					{included.map((command) => (
						<CommandChip
							key={command.name}
							command={command}
							note={isDefaultMcpCommand(command.name, list) ? "In Harper's default set." : 'Added.'}
							actionLabel={`Remove ${command.name}`}
							action={<XIcon className="size-3" />}
							onAction={() => onChange(removeMcpCommand(list, command.name))}
							disabled={disabled}
						/>
					))}
				</div>
			</div>

			{addedPatterns.length > 0 && (
				<EntryList
					title="Added patterns"
					entries={addedPatterns}
					actionLabel={(entry) => `Remove ${entry}`}
					action={<XIcon className="size-3" />}
					onAction={(entry) => onChange(dropAddedMcpEntry(list, entry))}
					disabled={disabled}
				/>
			)}

			{list.removed.length > 0 && (
				<EntryList
					title="Removed"
					entries={list.removed}
					actionLabel={(entry) => `Put back ${entry}`}
					action={<RotateCcwIcon className="size-3" />}
					onAction={(entry) => onChange(restoreMcpCommand(list, entry))}
					disabled={disabled}
				/>
			)}

			{servedNow.length > 0 && (
				<p className="text-xs text-warning">
					This instance serves <span className="font-mono">{servedNow.map((command) => command.name).join(', ')}</span>
					{' '}
					today, which Harper keeps out of its default set. Saving from Studio takes{' '}
					{servedNow.length === 1 ? 'it' : 'them'} out unless you add {servedNow.length === 1 ? 'it' : 'each one'}{' '}
					by name.
				</p>
			)}

			{changesData.length > 0 && (
				<p className="text-xs text-warning">
					AI tools can run {pluralize(changesData.length, 'command', 'commands')} here that change or delete data:{' '}
					<span className="font-mono">{changesData.map((command) => command.name).join(', ')}</span>. The user an AI
					tool signs in as still needs a role that allows each one.
				</p>
			)}

			{agentSharesMcpOperationsList(version) && (
				<p className="text-xs text-muted-foreground">
					Harper's built-in agent uses this same list, even while the operations part is off, so changing it changes
					what the agent can do too.
				</p>
			)}
		</div>
	);
}

function CommandChip({
	command,
	note,
	action,
	actionLabel,
	onAction,
	disabled,
}: {
	command: McpCommand;
	note: string;
	action: ReactNode;
	actionLabel: string;
	onAction: () => void;
	disabled?: boolean;
}) {
	return (
		<Badge
			variant={command.changesData ? 'warning' : 'outline'}
			title={command.changesData ? `${note} ${CHANGES_DATA_TITLE}` : note}
			className="gap-1 font-mono text-xs"
		>
			{command.name}
			{!disabled && (
				<button type="button" aria-label={actionLabel} onClick={onAction} className="ml-0.5 rounded-sm">
					{action}
				</button>
			)}
		</Badge>
	);
}

function EntryList({
	title,
	entries,
	action,
	actionLabel,
	onAction,
	disabled,
}: {
	title: string;
	entries: string[];
	action: ReactNode;
	actionLabel: (entry: string) => string;
	onAction: (entry: string) => void;
	disabled?: boolean;
}) {
	return (
		<div>
			<p className="mb-1 text-xs text-muted-foreground">{title}:</p>
			<div className="flex flex-wrap gap-1">
				{entries.map((entry) => (
					<Badge key={entry} variant="secondary" className="gap-1 font-mono text-xs">
						{entry}
						{!disabled && (
							<button
								type="button"
								aria-label={actionLabel(entry)}
								onClick={() => onAction(entry)}
								className="ml-0.5 rounded-sm"
							>
								{action}
							</button>
						)}
					</Badge>
				))}
			</div>
		</div>
	);
}
