import { Input } from '@/components/ui/input';
import { formatOrgLabel } from '@/features/admin/regions/queries/getOrganizations';
import { getAllOrganizationsQueryOptions } from '@/features/organizations/queries/getAllOrganizations';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/cn';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { type ComponentProps, type KeyboardEvent, useId, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Picks an organization by searching the server as you type, so it works at any number of orgs.
 * Backed by the admin organizations search: relevance-ranked over name and subdomain, and a pasted
 * org or cluster id resolves straight to its organization. Typing after a choice clears it, so the
 * box never shows one org while the form holds another.
 */
export function OrganizationPicker({ value, onChange, placeholder, ...inputProps }:
	& { value: string; onChange: (organizationId: string) => void }
	& Omit<ComponentProps<'input'>, 'value' | 'onChange'>)
{
	const listId = useId();
	const [text, setText] = useState('');
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	// While a choice stands, its label is in the box; search the default list rather than that label.
	const term = useDebounce(value ? '' : text, SEARCH_DEBOUNCE_MS);
	const { data, isFetching } = useQuery(getAllOrganizationsQueryOptions(0, term));
	const organizations = data?.organizations ?? [];

	const choose = (index: number) => {
		const org = organizations[index];
		if (!org) { return; }
		onChange(org.id);
		setText(formatOrgLabel(org.id, org.name));
		setOpen(false);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (!open) {
				setOpen(true);
				setActive(0);
			} else { setActive((index) => Math.min(index + 1, organizations.length - 1)); }
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			setActive((index) => Math.max(index - 1, 0));
		} else if (event.key === 'Enter' && open) {
			// Choosing from the list must not submit the form.
			event.preventDefault();
			choose(active);
		} else if (event.key === 'Escape' && open) {
			setOpen(false);
		}
	};

	const optionId = (index: number) => `${listId}-option-${index}`;

	return (
		<div className="flex flex-col gap-1">
			<div className="relative">
				<Input
					{...inputProps}
					role="combobox"
					aria-autocomplete="list"
					aria-expanded={open}
					aria-controls={listId}
					aria-activedescendant={open && organizations[active] ? optionId(active) : undefined}
					autoComplete="off"
					placeholder={placeholder ?? 'Search by name, subdomain or id'}
					value={text}
					onChange={(event) => {
						setText(event.target.value);
						setOpen(true);
						setActive(0);
						if (value) { onChange(''); }
					}}
					onFocus={() => setOpen(true)}
					onBlur={() => setOpen(false)}
					onKeyDown={onKeyDown}
				/>
				{isFetching && (
					<Loader2
						aria-hidden
						className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
					/>
				)}
			</div>
			{open && (
				<div id={listId} role="listbox" className="max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
					{organizations.length === 0
						? (
							<p className="px-2 py-1.5 text-sm text-muted-foreground">
								{isFetching ? 'Searching…' : 'No organizations match'}
							</p>
						)
						: organizations.map((org, index) => (
							<div
								key={org.id}
								id={optionId(index)}
								role="option"
								aria-selected={org.id === value}
								// Keep focus in the box, so its blur doesn't close the list before the click lands.
								onMouseDown={(event) => event.preventDefault()}
								onMouseEnter={() =>
									setActive(index)}
								onClick={() =>
									choose(index)}
								className={cn(
									'cursor-pointer truncate rounded-sm px-2 py-1.5 text-sm',
									index === active && 'bg-accent text-accent-foreground',
								)}
							>
								{formatOrgLabel(org.id, org.name)}
							</div>
						))}
					{data?.hasNextPage && (
						<p className="px-2 py-1.5 text-xs text-muted-foreground">
							More organizations match; keep typing to narrow it down.
						</p>
					)}
				</div>
			)}
		</div>
	);
}
