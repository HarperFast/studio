import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { groupBy } from '@/lib/groupBy';
import { ChevronDown, PlusIcon } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';

export interface PickerOperation {
	name: string;
	category: string;
}

/** A filter miss offered as an entry of its own, e.g. a component-registered operation no catalog can know. */
export interface PickerCustomCandidate {
	name: string;
	label: ReactNode;
}

/**
 * Grouped checkbox dropdown over a catalog of operation names, shared by a role's allowlist and the MCP server's
 * command list. Borrows the filter/typeahead handling from `features/admin/regions/components/MultiSelect` (which
 * fits chips of known options but not category sections, per-entry badges, or free-text names).
 */
export function OperationsPicker<T extends PickerOperation>({
	operations,
	categories,
	selected,
	onToggle,
	renderBadge,
	customCandidate,
	triggerLabel,
	disabled,
}: {
	operations: readonly T[];
	/** Display order; an operation in a category not listed here is not shown. */
	categories: readonly string[];
	selected: ReadonlySet<string>;
	onToggle: (name: string) => void;
	renderBadge?: (operation: T) => ReactNode;
	/** Given the trimmed filter text, whether to offer it as an entry the catalog doesn't hold. */
	customCandidate?: (query: string) => PickerCustomCandidate | undefined;
	triggerLabel: string;
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
	const filtered = query
		? operations.filter((operation) => operation.name.toLowerCase().includes(query))
		: operations;
	const byCategory = groupBy([...filtered], 'category');
	const custom = rawQuery ? customCandidate?.(rawQuery) : undefined;

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
					<span className="truncate text-muted-foreground">{triggerLabel}</span>
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
				{categories.filter((category) => byCategory[category]).map((category) => (
					<div key={category}>
						<DropdownMenuLabel className="text-xs text-muted-foreground">{category}</DropdownMenuLabel>
						{byCategory[category].map((operation) => (
							<DropdownMenuCheckboxItem
								key={operation.name}
								checked={selected.has(operation.name)}
								onCheckedChange={() => onToggle(operation.name)}
								// Keep the menu open across picks.
								onSelect={(event) => event.preventDefault()}
							>
								<span className="flex-1 truncate font-mono text-xs">{operation.name}</span>
								{renderBadge?.(operation)}
							</DropdownMenuCheckboxItem>
						))}
					</div>
				))}
				{custom && (
					<DropdownMenuCheckboxItem
						checked={false}
						onCheckedChange={() => onToggle(custom.name)}
						onSelect={(event) => event.preventDefault()}
					>
						<PlusIcon className="size-3" />
						<span className="flex-1 truncate text-xs">{custom.label}</span>
					</DropdownMenuCheckboxItem>
				)}
				{filtered.length === 0 && !custom && (
					<div className="px-2 py-1.5 text-sm text-muted-foreground">No matching operations</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
