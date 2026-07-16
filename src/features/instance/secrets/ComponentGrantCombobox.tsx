/**
 * The input used to grant a scoped secret to an application, shared by the add flow
 * (PendingGrantsInput) and the edit flow (SecretGrantsEditor). A grant targets a component by
 * name, and that name has to match a deployed component exactly — a typo silently scopes the
 * secret to nothing. So instead of a bare text box, this is a combobox seeded with the components
 * the cluster actually reports (`get_components`): the user picks one from a filtered list rather
 * than retyping a long, error-prone name.
 *
 * It stays a combobox, not a strict select, on purpose — a component that isn't deployed yet (or
 * that the connected Harper doesn't surface) can still be pre-authorized by typing its name, which
 * the list offers as an explicit "use this name" option. When the cluster reports no components
 * (older Harper, missing permission), it degrades to a plain free-text field.
 *
 * Presentational only: the caller supplies the known component names and owns persistence, so the
 * reusable secrets kit stays free of data-fetching and router coupling.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { PlusIcon } from 'lucide-react';
import { KeyboardEvent, useCallback, useId, useMemo, useRef, useState } from 'react';

interface ComponentGrantComboboxProps {
	/** Component names the cluster reports (`get_components`); empty when unavailable. */
	components: string[];
	/** Already-granted names — hidden from the list and rejected as duplicates. */
	granted: string[];
	/**
	 * Commit a chosen or typed component name. May be async (the edit flow's grant_secret); resolve
	 * to clear the field, reject to keep the typed text so the user can retry (the caller owns any
	 * error toast).
	 */
	onAdd: (component: string) => void | Promise<void>;
	disabled?: boolean;
	/** Action button label — "Add" for the pending (add) flow, "Grant" for the live (edit) flow. */
	actionLabel?: string;
	/**
	 * Commit the typed text when focus leaves the field. The add flow turns this on so submitting
	 * the surrounding form (which blurs this field first) doesn't silently drop a typed-but-not-added
	 * name; the edit flow leaves it off so a stray blur never fires a grant_secret request.
	 */
	commitOnBlur?: boolean;
}

/** A concrete option the user can commit: a known component, or the typed free-text name. */
interface Option {
	value: string;
	/** The typed name that isn't (yet) a known component — offered as an explicit "use this" row. */
	custom: boolean;
}

export function ComponentGrantCombobox({
	components,
	granted,
	onAdd,
	disabled,
	actionLabel = 'Add',
	commitOnBlur = false,
}: ComponentGrantComboboxProps) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [activeIdx, setActiveIdx] = useState(0);
	const [isCommitting, setIsCommitting] = useState(false);
	const listboxId = useId();
	const optionIdPrefix = useId();
	// Guards the blur handler while a suggestion is being clicked: onMouseDown fires before blur, so
	// we suppress the blur-close (and any commitOnBlur) until the click's own commit has run.
	const clickingOption = useRef(false);
	// Synchronous re-entrancy guard: `isCommitting` state lags a render, so a burst of Enters (or an
	// Enter racing the click) could fire onAdd twice before `disabled={busy}` catches up.
	const committing = useRef(false);

	const busy = disabled || isCommitting;

	const options = useMemo<Option[]>(() => {
		// No components reported (older Harper / no permission): stay a plain free-text field — no
		// dropdown, no "use this" row (there's nothing to disambiguate it from). Enter/Add still commit
		// the typed value via commitActive's `?? query` fallback.
		if (components.length === 0) {
			return [];
		}
		const q = query.trim();
		const qLower = q.toLowerCase();
		const grantedSet = new Set(granted);
		const available = components.filter((name) => !grantedSet.has(name));
		const matches = q ? available.filter((name) => name.toLowerCase().includes(qLower)) : available;
		const known: Option[] = matches.map((value) => ({ value, custom: false }));
		// Offer the typed name explicitly when it isn't already an available match — this is what lets
		// a not-yet-deployed component be pre-authorized without turning the whole field free-form.
		const hasExact = available.some((name) => name.toLowerCase() === qLower);
		if (q && !hasExact) {
			known.push({ value: q, custom: true });
		}
		return known;
	}, [components, granted, query]);

	// Clamp the active row whenever the option set shrinks (e.g. the list filters down as you type).
	const clampedActiveIdx = options.length === 0 ? 0 : Math.min(activeIdx, options.length - 1);

	const commit = useCallback(
		async (value: string) => {
			if (committing.current) {
				return;
			}
			const target = value.trim();
			// Empty or already-granted: nothing to do, just clear the field (matches the old behaviour).
			if (!target || granted.includes(target)) {
				setQuery('');
				return;
			}
			committing.current = true;
			setIsCommitting(true);
			try {
				await onAdd(target);
				setQuery('');
				setOpen(false);
			} catch {
				// The caller surfaced the error; keep the typed text so the user can retry.
			} finally {
				committing.current = false;
				setIsCommitting(false);
			}
		},
		[granted, onAdd],
	);

	// Enter and the action button both accept the highlighted row — a reported component (the safe
	// default that dodges typos) or, when the typed name matches none, the explicit "use this" row.
	const commitActive = useCallback(() => {
		void commit(options[clampedActiveIdx]?.value ?? query);
	}, [commit, options, clampedActiveIdx, query]);

	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				setOpen(true);
				// Move relative to the row that's actually highlighted (clampedActiveIdx), not the raw
				// state — which can be stale/out-of-bounds after the list filtered down as you typed.
				setActiveIdx(Math.min(clampedActiveIdx + 1, Math.max(0, options.length - 1)));
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				setActiveIdx(Math.max(0, clampedActiveIdx - 1));
				return;
			}
			if (event.key === 'Escape') {
				if (open) {
					// Close only the dropdown — don't let Escape bubble to the surrounding Radix Dialog.
					event.preventDefault();
					event.stopPropagation();
					setOpen(false);
				}
				return;
			}
			if (event.key === 'Enter') {
				// This input lives inside a form — Enter must add a grant, never submit the form.
				event.preventDefault();
				commitActive();
			}
		},
		[open, options, clampedActiveIdx, commitActive],
	);

	const onBlur = useCallback(() => {
		if (clickingOption.current) {
			return;
		}
		setOpen(false);
		// Commit the same thing Enter/the button would (the highlighted row), not the raw text — so
		// tabbing away after typing "web" grants "web-app" rather than the typo, and all three commit
		// paths stay consistent. Still a safety net for the add flow: submitting the surrounding form
		// blurs this field first, so a typed-but-not-added name isn't silently dropped.
		if (commitOnBlur && query.trim()) {
			commitActive();
		}
	}, [commitOnBlur, query, commitActive]);

	const showDropdown = open && options.length > 0;

	return (
		<div className="relative grid gap-2">
			<div className="flex gap-2">
				<Input
					type="text"
					role="combobox"
					aria-expanded={showDropdown}
					// Only point at the listbox while it's actually rendered — otherwise it's a dangling
					// idref for screen readers.
					aria-controls={showDropdown ? listboxId : undefined}
					aria-autocomplete="list"
					aria-activedescendant={showDropdown && options[clampedActiveIdx]
						? `${optionIdPrefix}-${clampedActiveIdx}`
						: undefined}
					autoComplete="off"
					autoCapitalize="off"
					placeholder={components.length > 0 ? 'Search applications…' : 'application name'}
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setActiveIdx(0);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onKeyDown={onKeyDown}
					onBlur={onBlur}
					disabled={busy}
				/>
				<Button
					type="button"
					variant="positiveOutline"
					// Keep focus in the input so the blur handler (and commitOnBlur) don't race the click.
					onMouseDown={(event) => event.preventDefault()}
					onClick={commitActive}
					disabled={busy || !query.trim()}
				>
					<PlusIcon /> {actionLabel}
				</Button>
			</div>
			{showDropdown && (
				<ul
					id={listboxId}
					role="listbox"
					className="bg-popover text-popover-foreground absolute top-11 z-10 max-h-56 w-full overflow-auto rounded-md border p-1 shadow-md"
				>
					{options.map((option, idx) => {
						const isActive = idx === clampedActiveIdx;
						return (
							<li
								key={option.custom ? `__custom__${option.value}` : option.value}
								id={`${optionIdPrefix}-${idx}`}
								role="option"
								aria-selected={isActive}
								onMouseEnter={() => setActiveIdx(idx)}
								// onMouseDown (not onClick) so we commit before the input's blur fires; preventDefault
								// keeps focus in the input. The ref flag stops the blur handler closing us mid-click.
								onMouseDown={(event) => {
									event.preventDefault();
									clickingOption.current = true;
									void commit(option.value).finally(() => {
										clickingOption.current = false;
									});
								}}
								className={cn(
									'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm',
									isActive && 'bg-accent text-accent-foreground',
								)}
							>
								{option.custom
									? (
										<span className="truncate">
											Use “<span className="font-mono">{option.value}</span>” — not a deployed application
										</span>
									)
									: <span className="truncate font-mono">{option.value}</span>}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
