import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/features/admin/users/components/EmptyState';
import {
	DuplicateAccountError,
	findUserIdByEmail,
	normalizeEmail,
	userDetailsQueryKey,
} from '@/features/admin/users/userAdminApi';
import { detectEntityId } from '@/lib/string/entityId';
import { describeError } from '@/react-query/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate, useRouter } from '@tanstack/react-router';
import { Loader2Icon, SearchIcon, TriangleAlertIcon, UserSearchIcon, UserXIcon } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';

type Lookup = { state: 'idle' | 'searching' } | { state: 'notFound'; email: string } | {
	state: 'failed';
	message: string;
};

export function UsersAdminLayout() {
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [input, setInput] = useState('');
	const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
	// Bumped by each lookup, each navigation (this page stays mounted while the next one loads) and unmount, so an
	// email lookup acts only if nothing else happened while it was out.
	const latestLookup = useRef(0);
	useEffect(() => {
		const unsubscribe = router.subscribe('onBeforeNavigate', () => {
			latestLookup.current++;
		});
		return () => {
			unsubscribe();
			latestLookup.current++;
		};
	}, [router]);

	const open = (userId: string) => {
		setLookup({ state: 'idle' });
		void queryClient.invalidateQueries({ queryKey: userDetailsQueryKey(userId) });
		void navigate({ to: '/admin/users/$userId', params: { userId } });
	};

	const lookUp = async (event: FormEvent) => {
		event.preventDefault();
		const thisLookup = ++latestLookup.current;
		const pasted = detectEntityId(input);
		if (pasted?.kind === 'user') {
			open(pasted.id);
			return;
		}

		setLookup({ state: 'searching' });
		let result: string | Lookup;
		try {
			result = (await findUserIdByEmail(input)) ?? { state: 'notFound', email: normalizeEmail(input) };
		} catch (error) {
			if (!(error instanceof DuplicateAccountError)) { console.error(error); }
			result = { state: 'failed', message: describeError(error).message };
		}
		if (thisLookup !== latestLookup.current) {
			setLookup({ state: 'idle' });
			return;
		}
		if (typeof result === 'string') {
			open(result);
			return;
		}
		setLookup(result);
		// Close the open account, so the message never sits above someone else's details.
		void navigate({ to: '/admin/users' });
	};

	return (
		<div className="max-w-5xl">
			<h1 className="text-2xl font-light">Users</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				Look up an account to see its organizations and their clusters, and to deactivate it.
			</p>

			<form className="mt-6 rounded-xl border bg-card p-4 sm:p-5" onSubmit={lookUp}>
				<Label htmlFor="admin-user-search">Email or user ID</Label>
				<div className="mt-2 flex flex-col gap-3 sm:flex-row">
					<div className="relative flex-1">
						<SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							id="admin-user-search"
							className="h-10 pl-9"
							autoComplete="off"
							spellCheck={false}
							placeholder="name@example.com or usr-…"
							value={input}
							onChange={(event) => setInput(event.target.value)}
						/>
					</div>
					<Button
						type="submit"
						variant="submit"
						className="h-10 sm:w-32"
						disabled={!input.trim() || lookup.state === 'searching'}
					>
						{lookup.state === 'searching' && <Loader2Icon className="animate-spin" />}
						Look up
					</Button>
				</div>
				{lookup.state === 'notFound'
					? (
						<p className="mt-3 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
							<UserXIcon className="size-4 shrink-0 text-muted-foreground" />
							No account uses {lookup.email}.
						</p>
					)
					: lookup.state === 'failed'
					? (
						<p className="mt-3 flex items-center gap-2 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
							<TriangleAlertIcon className="size-4 shrink-0" />
							{lookup.message}
						</p>
					)
					: (
						<p className="mt-2 text-xs text-muted-foreground">
							A user ID opens the account directly; an email address finds the one live account that uses it.
						</p>
					)}
			</form>

			<div className="mt-8">
				<Outlet />
			</div>
		</div>
	);
}

export function UsersSearchPrompt() {
	return (
		<EmptyState icon={<UserSearchIcon />} title="Find an account">
			You will see its organizations, the clusters in each, and which memberships a deactivation would remove.
		</EmptyState>
	);
}
