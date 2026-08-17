import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
	expandEffectiveOperations,
	getAvailableGroups,
	getGrantableOperations,
	getOperationInfo,
	GrantableOperation,
	isGrantGateInert,
	isOperationGroupName,
	OPERATION_CATALOG,
	OPERATION_CATEGORIES,
	OPERATION_GROUPS,
	OperationGroup,
	summarizeOperations,
} from '@/features/instance/config/roles/operations/operationsCatalog';
import { STRUCTURE_USER_DDL_OPERATIONS } from '@/integrations/api/localRolePermission';
import { groupBy } from '@/lib/groupBy';
import { pluralize } from '@/lib/pluralize';
import { ChevronDown, PlusIcon, XIcon } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

/**
 * Structured editor for a role's `permission.operations` allowlist (HarperFast/studio#1627).
 * A lens over the permission JSON, not a second source of truth: `value` is the raw array from
 * the parsed JSON, and every interaction reports the whole next array (or undefined to remove the
 * restriction) through `onChange`. Entries we don't recognize — component-registered operations
 * on 5.2+, or names from a newer Harper — are preserved and rendered, just not offered.
 */
export function OperationsAllowlistEditor({
	value,
	onChange,
	version,
	allowlistRejected,
	structureUserDdl,
	disabled,
}: {
	value: string[] | undefined;
	onChange: (next: string[] | undefined) => void;
	version: string;
	/** super_user/cluster_user: Harper refuses to store an allowlist alongside the flag. */
	allowlistRejected?: boolean;
	/** structure_user DDL carve-out: `true` everywhere, an array for those databases only. */
	structureUserDdl?: true | string[] | false;
	disabled?: boolean;
}) {
	const restricted = value !== undefined;
	const offeredGroups = getAvailableGroups(version);
	// A saved group this version doesn't offer (e.g. `agent` saved by a 5.2 cluster, edited against
	// 5.1) still needs a visible, removable control — otherwise it silently counts toward the
	// effective set with nothing on screen representing it.
	const unofferedSelectedGroups = OPERATION_GROUPS.filter(
		(group) => !offeredGroups.includes(group) && value?.includes(group.name),
	);
	const grantable = getGrantableOperations(version);
	const selectedSet = new Set(value ?? []);
	const selectedOperations = (value ?? []).filter((entry) => !isOperationGroupName(entry));
	const effective = value ? expandEffectiveOperations(value) : [];
	// A gate-inert grant delegates nothing, so it must not be counted toward the delegation notice
	// that the picker badge and chip beside it explicitly retract.
	const delegatesSu = effective.some((name) => getOperationInfo(name)?.su && !isGrantGateInert(name));
	// Keeps the last allowlist so a misclick on the switch (the only control that WIDENS
	// privileges) is a toggle away from undone, not a destroyed curation.
	const previousRestrictionRef = useRef<string[]>([]);

	// Canonical write order keeps the JSON stable and diffable: groups first, then operations,
	// each in catalog/alphabetical order, de-duplicated. Ordering uses the full group catalog, not
	// the version-filtered one, so an entry this version doesn't offer still survives a rewrite.
	const write = (nextEntries: Iterable<string>) => {
		const next = new Set(nextEntries);
		const orderedGroups = OPERATION_GROUPS.map((group) => group.name).filter((name) => next.has(name));
		const orderedOperations = [...next].filter((entry) => !isOperationGroupName(entry)).sort();
		onChange([...orderedGroups, ...orderedOperations]);
	};

	const toggle = (entry: string) => {
		const next = new Set(value ?? []);
		if (next.has(entry)) {
			next.delete(entry);
		} else {
			next.add(entry);
		}
		write(next);
	};

	const onRestrictedToggled = (checked: boolean) => {
		if (checked) {
			onChange(previousRestrictionRef.current);
		} else {
			previousRestrictionRef.current = value ?? [];
			onChange(undefined);
		}
	};

	return (
		<div className="flex flex-col gap-2 rounded-md border p-3">
			<Label className="flex items-center gap-2">
				<Switch
					checked={restricted}
					onCheckedChange={onRestrictedToggled}
					disabled={disabled}
					aria-label="Restrict operations"
				/>
				<span className="font-medium">Restrict operations</span>
			</Label>
			<p className="text-xs text-muted-foreground">
				{restricted
					? 'Only the operations below are allowed — anything unlisted is denied. Listing an operation that '
						+ 'normally requires super_user deliberately grants it to this role. SQL statements are authorized '
						+ 'against table permissions instead, so this list does not restrict them.'
					: 'No operation-level restriction. Add one to limit this role to an explicit list of API operations '
						+ '(for example a deploy-only CI role).'}
			</p>
			{allowlistRejected && (
				// validateNoSUPerms rejects any multi-key permission setting super_user/cluster_user, so
				// this combination fails the save outright rather than being merely inert.
				<p className="text-xs text-destructive">
					Harper does not accept an operations allowlist on a super_user or cluster_user role — the save is rejected
					unless the list is dropped. Clear that flag to scope this role by operation; otherwise the allowlist is
					removed when you save.
				</p>
			)}
			{structureUserDdl && restricted && (
				<p className="text-xs text-warning">
					This role is a structure user, so it reaches{' '}
					<span className="font-mono">{STRUCTURE_USER_DDL_OPERATIONS.join(', ')}</span>
					{structureUserDdl === true
						? ' (and create/drop database) on any database'
						: (
							<>
								on <span className="font-mono">{structureUserDdl.join(', ')}</span>
							</>
						)} regardless of the list below. Every other operation is still gated by it.
				</p>
			)}

			{restricted && (
				<>
					<div className="flex flex-col gap-1">
						{offeredGroups.map((group) => (
							<GroupCheckbox
								key={group.name}
								group={group}
								checked={selectedSet.has(group.name)}
								onToggle={toggle}
								disabled={disabled}
							/>
						))}
						{unofferedSelectedGroups.map((group) => (
							<GroupCheckbox
								key={group.name}
								group={group}
								note="Saved on this role, but not offered for this instance's Harper version."
								checked
								onToggle={toggle}
								disabled={disabled}
							/>
						))}
					</div>

					<OperationsPicker
						grantable={grantable}
						selectedSet={selectedSet}
						onToggle={toggle}
						disabled={disabled}
					/>

					{selectedOperations.length > 0 && (
						<div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
							{selectedOperations.map((name) => (
								<OperationChip
									key={name}
									name={name}
									onRemove={() => toggle(name)}
									disabled={disabled}
								/>
							))}
						</div>
					)}

					{effective.length === 0
						? (
							<p className="text-xs text-destructive">
								Nothing selected — this role cannot run any operation
								{structureUserDdl ? ' except the DDL noted above' : ''}.
							</p>
						)
						: (
							<p className="text-xs text-muted-foreground" title={summarizeOperations(effective)}>
								Effectively allows {pluralize(effective.length, 'operation', 'operations')}
								{delegatesSu ? ', including some that normally require super_user' : ''}.
								<span className="sr-only">: {summarizeOperations(effective)}</span>
							</p>
						)}
				</>
			)}
		</div>
	);
}

function GroupCheckbox({
	group,
	note,
	checked,
	onToggle,
	disabled,
}: {
	group: OperationGroup;
	note?: string;
	checked: boolean;
	onToggle: (name: string) => void;
	disabled?: boolean;
}) {
	return (
		<Label className="flex items-start gap-2 font-normal">
			<Input
				type="checkbox"
				className="mt-0.5 size-4"
				checked={checked}
				onChange={() => onToggle(group.name)}
				disabled={disabled}
			/>
			<span>
				<span className="font-mono text-xs">{group.name}</span>
				<span className="block text-xs text-muted-foreground">{note ?? group.description}</span>
			</span>
		</Label>
	);
}

// Component-registered operation names are exact strings, not identifiers — camelCase, hyphens,
// dots, and colons are all legal (`deploy-v2`, `acme.deploy`) — so keep the case and only rule
// out whitespace/quote garbage that could never be an operation name.
const CUSTOM_OPERATION_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]*$/;

/**
 * Grouped checkbox dropdown over the grantable catalog, borrowing the filter/typeahead handling
 * from `features/admin/regions/components/MultiSelect` (which fits chips of known options but not
 * category sections, super_user badges, or free-text names for component-registered operations).
 */
function OperationsPicker({
	grantable,
	selectedSet,
	onToggle,
	disabled,
}: {
	grantable: GrantableOperation[];
	selectedSet: Set<string>;
	onToggle: (name: string) => void;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [filter, setFilter] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);

	// Radix focuses the menu (enabling its typeahead) on open; move focus to the filter input so
	// the first keystrokes filter instead. The dropdown-menu primitive has no onOpenAutoFocus
	// (unlike Dialog), hence the two rAFs: the first lets the portaled content mount, the second
	// lands after Radix's own mount-autofocus so ours wins (same approach as MultiSelect).
	useEffect(() => {
		if (!open) {
			return;
		}
		let inner = 0;
		const outer = requestAnimationFrame(() => {
			inner = requestAnimationFrame(() => inputRef.current?.focus());
		});
		return () => {
			cancelAnimationFrame(outer);
			cancelAnimationFrame(inner);
		};
	}, [open]);

	const rawQuery = filter.trim();
	const query = rawQuery.toLowerCase();
	const filtered = query ? grantable.filter((operation) => operation.name.includes(query)) : grantable;
	const byCategory = groupBy(filtered, 'category');

	// Component-registered operations (5.2+) have instance-specific names no static catalog can
	// know, so a filter miss that looks like an operation name is offered as a custom grant.
	// Anything the catalog already speaks for stays out — groups, non-delegable ops, and alias
	// spellings the picker deliberately withholds — as does a case variant of a known name, which
	// validateOperations rejects. A catalog name this version merely predates is allowed through,
	// since the server validates and may well accept it (backports).
	const knownInfo = getOperationInfo(rawQuery);
	// A miss that only differs in case from a name we know: the server would reject it, so offering
	// it buys an opaque save error. A name we know exactly but this version predates is different —
	// that one stays offered, since a backport may well accept it.
	const caseVariantOfKnownName = !knownInfo
		&& (isOperationGroupName(query) || OPERATION_CATALOG.some((operation) => operation.name === query));
	const customCandidate = CUSTOM_OPERATION_PATTERN.test(rawQuery)
			&& !isOperationGroupName(rawQuery)
			&& !caseVariantOfKnownName
			&& !knownInfo?.nonDelegable
			&& !knownInfo?.aliasOf
			&& !grantable.some((operation) => operation.name === rawQuery)
			&& !selectedSet.has(rawQuery)
		? rawQuery
		: undefined;

	// From the filter input the arrow keys must move into the list ourselves — Radix only does it
	// when the keydown target is the content element. Printable keys stay ours, not typeahead's.
	const onFilterKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const items = contentRef.current?.querySelectorAll<HTMLElement>(
				'[role="menuitemcheckbox"]:not([data-disabled])',
			);
			if (items?.length) {
				(event.key === 'ArrowDown' ? items[0] : items[items.length - 1]).focus();
			}
			return;
		}
		if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
			event.stopPropagation();
		}
	};

	return (
		<DropdownMenu
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					setFilter('');
				}
			}}
		>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<Button type="button" variant="outline" className="w-full justify-between font-normal">
					<span className="truncate text-muted-foreground">Add operations…</span>
					<ChevronDown className="size-4 shrink-0 opacity-60" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				ref={contentRef}
				className="w-(--radix-dropdown-menu-trigger-width) max-h-72 overflow-y-auto"
				align="start"
			>
				<input
					ref={inputRef}
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
					onKeyDown={onFilterKeyDown}
					placeholder="Filter operations…"
					aria-label="Filter operations"
					className="mb-1 w-full rounded-md border bg-transparent px-2 py-1 text-sm outline-none"
				/>
				{OPERATION_CATEGORIES.filter((category) => byCategory[category]).map((category) => (
					<div key={category}>
						<DropdownMenuLabel className="text-xs text-muted-foreground">{category}</DropdownMenuLabel>
						{byCategory[category].map((operation) => (
							<DropdownMenuCheckboxItem
								key={operation.name}
								checked={selectedSet.has(operation.name)}
								onCheckedChange={() => onToggle(operation.name)}
								// Keep the menu open across picks.
								onSelect={(event) => event.preventDefault()}
							>
								<span className="flex-1 truncate font-mono text-xs">{operation.name}</span>
								{isGrantGateInert(operation.name)
									? (
										<Badge
											variant="outline"
											title={'Harper authorizes this operation under its internal handler name, so listing it has '
												+ 'no effect on current 5.x releases (HarperFast/harper#2175). Kept available so the role '
												+ 'is ready once that lands.'}
										>
											not yet enforced
										</Badge>
									)
									: operation.su && (
										<Badge variant="warning" title="Normally requires super_user; listing it grants it to this role">
											super_user
										</Badge>
									)}
							</DropdownMenuCheckboxItem>
						))}
					</div>
				))}
				{customCandidate && (
					<DropdownMenuCheckboxItem
						checked={false}
						onCheckedChange={() => onToggle(customCandidate)}
						onSelect={(event) => event.preventDefault()}
					>
						<PlusIcon className="size-3" />
						<span className="flex-1 truncate text-xs">
							Grant "<span className="font-mono">{customCandidate}</span>" {knownInfo
								? '(listed for newer Harper versions — this instance may reject it)'
								: '(component-registered operation)'}
						</span>
					</DropdownMenuCheckboxItem>
				)}
				{filtered.length === 0 && !customCandidate && (
					<div className="px-2 py-1.5 text-sm text-muted-foreground">No matching operations</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function OperationChip({
	name,
	onRemove,
	disabled,
}: {
	name: string;
	onRemove: () => void;
	disabled?: boolean;
}) {
	const info = getOperationInfo(name);
	const inert = info?.nonDelegable || info?.aliasOf || isGrantGateInert(name);
	const variant = inert ? 'destructive' : info?.su ? 'warning' : info ? 'secondary' : 'outline';
	const title = info?.aliasOf
		? `Legacy alias: Harper authorizes this operation under '${info.aliasOf}', so this entry grants nothing. `
			+ `Grant '${info.aliasOf}' instead.`
		: isGrantGateInert(name)
		? 'Harper authorizes this operation under its internal handler name, so this grant has no effect on '
			+ 'current 5.x releases (HarperFast/harper#2175).'
		: info?.nonDelegable
		? 'Always requires an actual super_user role; listing it cannot delegate the operation to a '
			+ 'non-super_user role.'
		: info?.caveat
		? info.caveat
		: info?.su
		? 'Normally requires super_user; listing it grants it to this role.'
		: info
		? undefined
		: 'Not in the built-in catalog — kept as-is (for example a component-registered operation).';
	return (
		<Badge variant={variant} title={title} className="gap-1 font-mono text-xs">
			{name}
			{!disabled && (
				<button
					type="button"
					aria-label={`Remove ${name}`}
					onClick={onRemove}
					className="ml-0.5 rounded-sm hover:text-destructive"
				>
					<XIcon className="size-3" />
				</button>
			)}
		</Badge>
	);
}
