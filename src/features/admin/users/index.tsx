import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	DuplicateAccountError,
	findUserIdByEmail,
	normalizeEmail,
	userDetailsQueryKey,
} from '@/features/admin/users/userAdminApi';
import { detectEntityId } from '@/lib/string/entityId';
import { describeError } from '@/react-query/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { FormEvent, useEffect, useRef, useState } from 'react';

type Lookup = { state: 'idle' | 'searching' } | { state: 'notFound'; email: string } | {
	state: 'failed';
	message: string;
};

export function UsersAdminLayout() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [input, setInput] = useState('');
	const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
	// Bumped by each lookup and on unmount, so an email lookup that resolves after either is dropped.
	const latestLookup = useRef(0);
	useEffect(() => () => {
		latestLookup.current++;
	}, []);

	const open = (userId: string) => {
		setLookup({ state: 'idle' });
		// Looking up the account already open refreshes it rather than doing nothing.
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
		if (thisLookup !== latestLookup.current) { return; }
		if (typeof result === 'string') {
			open(result);
			return;
		}
		setLookup(result);
		// Close the open account, so the message never sits above someone else's Deactivate button.
		void navigate({ to: '/admin/users' });
	};

	return (
		<div className="max-w-4xl">
			<h1 className="text-2xl font-light">Users</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				Look up an account to see its organizations and their clusters, and to deactivate it.
			</p>

			<form className="mt-6 flex items-end gap-3" onSubmit={lookUp}>
				<div className="flex-1 space-y-2">
					<Label htmlFor="admin-user-search">Email or user ID</Label>
					<Input
						id="admin-user-search"
						autoComplete="off"
						spellCheck={false}
						placeholder="name@example.com or usr-…"
						value={input}
						onChange={(event) => setInput(event.target.value)}
					/>
				</div>
				<Button type="submit" variant="submit" disabled={!input.trim() || lookup.state === 'searching'}>
					Look up
				</Button>
			</form>

			{lookup.state === 'notFound' && (
				<p className="mt-3 text-sm text-muted-foreground">No account uses {lookup.email}.</p>
			)}
			{lookup.state === 'failed' && <p className="mt-3 text-sm text-destructive">{lookup.message}</p>}

			<div className="mt-6">
				<Outlet />
			</div>
		</div>
	);
}
