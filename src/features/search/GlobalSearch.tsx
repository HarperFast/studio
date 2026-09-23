import type { User } from '@/integrations/api/api.patch';
import { Search } from 'lucide-react';
import {
	createContext,
	lazy,
	type ReactNode,
	Suspense,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

const SearchDialog = lazy(() => import('./SearchDialog'));
const SearchContext = createContext<(() => void) | null>(null);

export function isSearchShortcut(event: KeyboardEvent) {
	const target = event.target;
	return !event.defaultPrevented && !event.isComposing && !event.altKey && !event.shiftKey
		&& (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
		&& !(target instanceof Element
			&& target.closest(
				'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .monaco-editor, [role="dialog"]',
			));
}

export function GlobalSearch({ user, children }: { user: User; children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const restoreFocus = useRef<HTMLElement | null>(null);
	const scope = useMemo(() => JSON.stringify([user.id, user.roles, user.fabricRole, user.staffPermissions]), [user]);
	const show = useCallback(() => {
		restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		setOpen(true);
	}, []);
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!isSearchShortcut(event)) { return; }
			event.preventDefault();
			show();
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [show]);
	return (
		<SearchContext.Provider value={show}>
			{children}
			{open && (
				<Suspense
					fallback={
						<div
							role="status"
							className="fixed top-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border bg-popover p-4 shadow-xl"
						>
							Opening search…
						</div>
					}
				>
					<SearchDialog
						key={scope}
						user={user}
						onClose={() => setOpen(false)}
						restoreFocus={() => restoreFocus.current?.focus()}
					/>
				</Suspense>
			)}
		</SearchContext.Provider>
	);
}

export function GlobalSearchTrigger() {
	const show = useContext(SearchContext);
	if (!show) { return null; }
	return (
		<button
			type="button"
			onClick={show}
			aria-label="Search organizations and clusters"
			className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary/20 bg-card/30 p-2 text-sm text-muted-foreground hover:bg-primary/15 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
		>
			<Search className="size-4" aria-hidden="true" />
			<span className="hidden lg:inline">Search</span>
			<kbd className="hidden xl:inline rounded border border-border px-1 text-xs">⌘ / Ctrl K</kbd>
		</button>
	);
}
