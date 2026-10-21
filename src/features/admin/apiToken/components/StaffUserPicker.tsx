import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { searchStaffUsersQueryOptions, StaffUserSummary } from '@/features/admin/apiToken/queries/staffUsers';
import { cn } from '@/lib/cn';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { KeyboardEvent, useEffect, useId, useState } from 'react';

/** One letter matches most of the company. */
const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;

interface StaffUserPickerProps {
	value: StaffUserSummary | null;
	onChange: (user: StaffUserSummary | null) => void;
	self: StaffUserSummary;
	id?: string;
	disabled?: boolean;
}

export function formatStaffUserLabel(user: StaffUserSummary, selfId: string): string {
	const name = [user.firstname, user.lastname].filter(Boolean).join(' ');
	const who = name ? `${user.email} (${name})` : user.email;
	return user.id === selfId ? `${who} — you` : who;
}

export function StaffUserPicker({ value, onChange, self, id, disabled }: StaffUserPickerProps) {
	const listboxId = useId();
	const queryClient = useQueryClient();
	const [prefix, setPrefix] = useState('');
	const [debouncedPrefix, setDebouncedPrefix] = useState('');
	const [open, setOpen] = useState(false);
	const [highlighted, setHighlighted] = useState(0);

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedPrefix(prefix.trim()), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [prefix]);

	const canSearch = debouncedPrefix.length >= SEARCH_MIN_LENGTH;
	const settled = prefix.trim() === debouncedPrefix;
	const { data, isError } = useQuery({
		...searchStaffUsersQueryOptions(debouncedPrefix),
		enabled: canSearch && open,
	});
	// Only the settled prefix's matches: an edit shows "Searching…" rather than the old ones.
	const matches = settled && canSearch ? data?.staff : undefined;

	useEffect(() => setHighlighted(0), [debouncedPrefix]);

	// Disabling the query does not abort a search in flight; cancelling it does, pages and all.
	const close = () => {
		setOpen(false);
		void queryClient.cancelQueries({ queryKey: searchStaffUsersQueryOptions(debouncedPrefix).queryKey });
	};

	const pick = (user: StaffUserSummary) => {
		onChange(user);
		setPrefix('');
		close();
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setOpen(true);
			setHighlighted((index) => Math.min(index + 1, Math.max((matches?.length ?? 0) - 1, 0)));
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			setHighlighted((index) => Math.max(index - 1, 0));
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const match = open ? matches?.[highlighted] : undefined;
			if (match) { pick(match); }
		} else if (event.key === 'Escape') {
			close();
		}
	};

	if (value) {
		return (
			<div className="flex items-center gap-2">
				<Input id={id} readOnly value={formatStaffUserLabel(value, self.id)} className="text-sm" />
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="shrink-0"
					aria-label="Change owner"
					disabled={disabled}
					onClick={() => onChange(null)}
				>
					<XIcon />
				</Button>
			</div>
		);
	}

	// A failed search is the toast's to report.
	const showList = open && !isError && prefix.trim().length >= SEARCH_MIN_LENGTH;
	return (
		<div className="relative">
			<div className="flex items-center gap-2">
				<Input
					id={id}
					role="combobox"
					aria-expanded={showList}
					aria-controls={listboxId}
					aria-autocomplete="list"
					autoComplete="off"
					placeholder="Search staff by email…"
					value={prefix}
					disabled={disabled}
					onChange={(event) => {
						setPrefix(event.target.value);
						setHighlighted(0);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onBlur={close}
					onKeyDown={onKeyDown}
				/>
				<Button type="button" variant="outline" className="shrink-0" disabled={disabled} onClick={() => pick(self)}>
					Me
				</Button>
			</div>
			{showList && (
				<ul
					id={listboxId}
					role="listbox"
					aria-label="Matching staff"
					className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
					// Keep the input focused so its blur doesn't close the list before the click lands.
					onMouseDown={(event) => event.preventDefault()}
				>
					{!matches
						? <li className="px-2 py-1.5 text-muted-foreground">Searching…</li>
						: matches.length === 0 && !data?.truncated
						? <li className="px-2 py-1.5 text-muted-foreground">No staff member matches “{prefix.trim()}”.</li>
						: matches.map((user, index) => (
							<li
								key={user.id}
								role="option"
								aria-selected={index === highlighted}
								className={cn(
									'cursor-pointer rounded-sm px-2 py-1.5',
									index === highlighted && 'bg-accent text-accent-foreground',
								)}
								onMouseEnter={() => setHighlighted(index)}
								onClick={() => pick(user)}
							>
								{formatStaffUserLabel(user, self.id)}
							</li>
						))}
					{matches && data?.truncated && (
						<li className="px-2 py-1.5 text-muted-foreground">
							Not every account sharing “{prefix.trim()}” was read; type more of the address if someone is missing.
						</li>
					)}
				</ul>
			)}
		</div>
	);
}
