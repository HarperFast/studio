import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { findUserIdByEmail, normalizeEmail, userDetailsQueryKey } from '@/features/admin/users/userAdminApi';
import { detectEntityId } from '@/lib/string/entityId';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { FormEvent, useState } from 'react';

type Lookup = { state: 'idle' | 'searching' } | { state: 'notFound'; email: string } | {
	state: 'failed';
	message: string;
};

/** The search stays above whichever account is open, so the next lookup is one step away. */
export function UsersAdminLayout() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [input, setInput] = useState('');
	const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });

	const lookUp = async (event: FormEvent) => {
		event.preventDefault();
		const pasted = detectEntityId(input);
		let userId = pasted?.kind === 'user' ? pasted.id : null;
		if (!userId) {
			const email = normalizeEmail(input);
			setLookup({ state: 'searching' });
			try {
				userId = await findUserIdByEmail(email);
			} catch (error) {
				setLookup({ state: 'failed', message: (error as Error)?.message || 'Could not look up that address.' });
				return;
			}
			if (!userId) {
				setLookup({ state: 'notFound', email });
				void navigate({ to: '/admin/users' });
				return;
			}
		}
		setLookup({ state: 'idle' });
		// Looking up the account already open refreshes it rather than doing nothing.
		void queryClient.invalidateQueries({ queryKey: userDetailsQueryKey(userId) });
		// Only the id reaches the URL: addresses must stay out of the page URL that RUM and third-party pixels read.
		void navigate({ to: '/admin/users/$userId', params: { userId } });
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
