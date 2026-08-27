import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { CheckIcon } from 'lucide-react';

export interface ScopeOption {
	id: string;
	label: string;
	/** Right-aligned detail — what tells two similarly named options apart. */
	hint?: string;
}

interface ScopePickerProps {
	options: ScopeOption[];
	value: string[];
	onChange: (next: string[]) => void;
	/** What no selection means, spelled out: an empty scope is "any", not "none". */
	unrestrictedLabel: string;
	emptyLabel: string;
	ariaLabel: string;
}

/**
 * Picks the members of a grant's scope. An empty selection is unrestricted — central-manager stores
 * null for "any", and refuses an empty array — so the summary line says which of the two the reader
 * is looking at rather than leaving an empty box to be read as "nothing is allowed".
 *
 * A selected id that is not in `options` still counts and is still shown: a grant can be scoped to a
 * plan or region that has since been retired, and dropping it here would silently widen the scope on
 * the next save.
 */
export function ScopePicker({ options, value, onChange, unrestrictedLabel, emptyLabel, ariaLabel }: ScopePickerProps) {
	const selected = new Set(value);
	const missing = value.filter((id) => !options.some((option) => option.id === id));
	const rows = [...options, ...missing.map((id) => ({ id, label: id, hint: 'no longer exists' }))];

	const toggle = (id: string) => onChange(selected.has(id) ? value.filter((entry) => entry !== id) : [...value, id]);

	return (
		<div className="flex flex-col gap-1">
			<div role="group" aria-label={ariaLabel} className="max-h-44 divide-y overflow-y-auto rounded-md border">
				{rows.length === 0
					? <p className="p-2 text-xs text-muted-foreground">{emptyLabel}</p>
					: rows.map((option) => (
						<button
							key={option.id}
							type="button"
							role="checkbox"
							aria-checked={selected.has(option.id)}
							onClick={() => toggle(option.id)}
							className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted/60"
						>
							<span
								aria-hidden
								className={cn(
									'flex size-4 shrink-0 items-center justify-center rounded-sm border',
									selected.has(option.id) && 'border-primary bg-primary text-primary-foreground',
								)}
							>
								{selected.has(option.id) && <CheckIcon className="size-3" />}
							</span>
							<span className="truncate">{option.label}</span>
							{option.hint && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{option.hint}</span>}
						</button>
					))}
			</div>
			<div className="flex items-center justify-between gap-2">
				<p className="text-xs text-muted-foreground">
					{value.length === 0 ? unrestrictedLabel : `Limited to ${value.length} of ${options.length}`}
				</p>
				{value.length > 0 && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-auto py-0 text-xs"
						onClick={() => onChange([])}
					>
						Clear
					</Button>
				)}
			</div>
		</div>
	);
}
