import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { ChevronDown, XIcon } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

export interface MultiSelectOption {
	value: string;
	label: string;
}

interface MultiSelectProps {
	options: MultiSelectOption[];
	selected: string[];
	onChange: (values: string[]) => void;
	placeholder?: string;
	emptyText?: string;
	ariaLabel?: string;
	disabled?: boolean;
	id?: string;
	/**
	 * Allow the same value more than once. Preferred locations are a placement list, not a set:
	 * repeating a location asks for another host there.
	 */
	allowRepeats?: boolean;
	/**
	 * Cap on how many matches are rendered at once. Options aren't virtualized, so a long list needs
	 * a ceiling; the rest stay reachable by narrowing the filter, and the overflow is shown as a count
	 * rather than dropped silently.
	 */
	maxVisibleOptions?: number;
}

/**
 * A checkbox multi-select with a filter and removable chips. Built on the shared Radix dropdown
 * (the repo has no combobox); the filter input swallows printable keys so Radix's menu typeahead
 * doesn't eat the typing, and each item preventDefaults onSelect so the menu stays open across picks.
 *
 * With `allowRepeats`, `selected` may contain duplicates: every menu click appends another copy
 * (never unselects), each copy is its own chip, and a chip's X removes just that copy — so the X is
 * the only way to remove. Without it the menu toggles and values stay unique.
 */
export function MultiSelect({
	options,
	selected,
	onChange,
	placeholder = 'Select…',
	emptyText = 'No options',
	ariaLabel,
	disabled,
	id,
	allowRepeats,
	maxVisibleOptions,
}: MultiSelectProps) {
	const [open, setOpen] = useState(false);
	const [filter, setFilter] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const selectedSet = useMemo(() => new Set(selected), [selected]);
	const labelFor = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);

	// Radix focuses the menu (enabling its typeahead) on open; move focus to the filter input so the
	// first keystrokes filter rather than trigger typeahead. Two rAFs: the first lets the portaled
	// popper content mount, the second lands after Radix's own mount-autofocus so ours wins.
	useEffect(() => {
		if (!open) { return; }
		let inner = 0;
		const outer = requestAnimationFrame(() => {
			inner = requestAnimationFrame(() => inputRef.current?.focus());
		});
		return () => {
			cancelAnimationFrame(outer);
			cancelAnimationFrame(inner);
		};
	}, [open]);

	const filtered = useMemo(() => {
		const q = filter.trim().toLowerCase();
		if (!q) { return options; }
		return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
	}, [options, filter]);

	const visible = maxVisibleOptions ? filtered.slice(0, maxVisibleOptions) : filtered;
	const overflowCount = filtered.length - visible.length;

	// A menu click adds: with repeats it always appends another copy, so the X on a chip is the only
	// way to remove. Without repeats it toggles the value in and out.
	const pick = (value: string) => {
		if (allowRepeats) { onChange([...selected, value]); }
		else if (selectedSet.has(value)) { onChange(selected.filter((v) => v !== value)); }
		else { onChange([...selected, value]); }
	};

	/** Drop one entry by position, so removing a repeat leaves its other copies alone. */
	const removeAt = (index: number) => onChange(selected.filter((_, i) => i !== index));

	// Radix only moves focus into the list when the keydown target IS the content element, so from the
	// filter input the arrow keys need handling here or the list is unreachable by keyboard. Once an
	// item has focus, Radix's roving focus takes over the rest of the arrows and Enter/Space.
	const focusEdgeItem = (edge: 'first' | 'last') => {
		const items = contentRef.current?.querySelectorAll<HTMLElement>(
			'[role="menuitemcheckbox"]:not([data-disabled])',
		);
		if (!items?.length) { return; }
		(edge === 'first' ? items[0] : items[items.length - 1]).focus();
	};

	const onFilterKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			focusEdgeItem(e.key === 'ArrowDown' ? 'first' : 'last');
			return;
		}
		// Only swallow printable keys, which are the ones Radix's typeahead would steal. Anything else
		// (Escape to close, Tab, Enter) has to reach Radix.
		if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) { e.stopPropagation(); }
	};

	return (
		<div className="flex flex-col gap-2">
			<DropdownMenu
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) { setFilter(''); }
				}}
			>
				<DropdownMenuTrigger asChild disabled={disabled}>
					<Button
						id={id}
						type="button"
						variant="outline"
						aria-label={ariaLabel}
						className="w-full justify-between font-normal"
					>
						<span className={selected.length ? 'truncate' : 'truncate text-muted-foreground'}>
							{selected.length ? `${selected.length} selected` : placeholder}
						</span>
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
						onChange={(e) => setFilter(e.target.value)}
						onKeyDown={onFilterKeyDown}
						placeholder="Filter…"
						aria-label="Filter options"
						className="mb-1 w-full rounded-md border bg-transparent px-2 py-1 text-sm outline-none"
					/>
					{filtered.length === 0
						? <div className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</div>
						: visible.map((o) => (
							<DropdownMenuCheckboxItem
								key={o.value}
								checked={selectedSet.has(o.value)}
								// Ignore the incoming checked value: with repeats a click on an already-checked
								// item means "add another", not "unselect".
								onCheckedChange={() => pick(o.value)}
								onSelect={(e) => e.preventDefault()}
							>
								{o.label}
							</DropdownMenuCheckboxItem>
						))}
					{overflowCount > 0 && (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							{overflowCount} more — keep typing to narrow
						</div>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			{selected.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{selected.map((value, index) => {
						const label = labelFor.get(value) ?? value;
						return (
							<Badge key={`${value}-${index}`} variant="secondary" className="gap-1">
								{label}
								<button
									type="button"
									aria-label={`Remove ${label}`}
									onClick={() => removeAt(index)}
									className="ml-0.5 rounded-sm hover:text-destructive"
								>
									<XIcon className="size-3" />
								</button>
							</Badge>
						);
					})}
				</div>
			)}
		</div>
	);
}
