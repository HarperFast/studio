import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MintedTokenCard } from '@/features/admin/apiToken/components/MintedTokenCard';
import { MintStaffApiTokenForm } from '@/features/admin/apiToken/components/MintStaffApiTokenForm';
import { maskTokenId, StaffApiTokenTable } from '@/features/admin/apiToken/components/StaffApiTokenTable';
import { getStaffApiTokensQueryOptions } from '@/features/admin/apiToken/queries/getStaffApiTokens';
import { getStaffUserQueryOptions, StaffUserSummary } from '@/features/admin/apiToken/queries/staffUsers';
import { STAFF_TOKEN_IDLE_DAYS } from '@/features/admin/apiToken/staffTokenRoles';
import { useCloudAuth, useStaffPermission } from '@/hooks/useAuth';
import { MintedStaffApiToken, StaffApiToken } from '@/integrations/api/api.patch';
import { useQueries, useQuery } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

/** What the filter box matches: everything the row shows, plus the ids behind the masked one. */
export function matchesTokenFilter(token: StaffApiToken, query: string, userText: (id: string) => string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) { return true; }
	return [
		token.name,
		token.role,
		token.status,
		token.id,
		maskTokenId(token.id),
		token.ownerUserId,
		userText(token.ownerUserId),
		token.createdByUserId,
		userText(token.createdByUserId),
	].some((value) => value.toLowerCase().includes(q));
}

function userSearchText(user: StaffUserSummary): string {
	return `${user.email} ${user.firstname ?? ''} ${user.lastname ?? ''}`;
}

export function ApiTokenIndex() {
	const { user } = useCloudAuth();
	const canMint = useStaffPermission('apiToken:create');
	const { data: tokens, isLoading, isError, isFetching, refetch } = useQuery(getStaffApiTokensQueryOptions());
	const [minted, setMinted] = useState<MintedStaffApiToken | null>(null);
	const [filter, setFilter] = useState('');

	// The same lookups the cells make, so the filter box matches the addresses the rows show.
	const otherIds = useMemo(() => {
		const ids = new Set<string>();
		for (const token of tokens ?? []) {
			ids.add(token.ownerUserId);
			ids.add(token.createdByUserId);
		}
		if (user) { ids.delete(user.id); }
		return [...ids];
	}, [tokens, user]);
	const lookups = useQueries({ queries: otherIds.map((id) => getStaffUserQueryOptions(id)) });
	const userText = useMemo(() => {
		const byId = new Map<string, string>();
		otherIds.forEach((id, index) => {
			const found = lookups[index]?.data;
			if (found && found !== 'removed') { byId.set(id, userSearchText(found)); }
		});
		if (user) { byId.set(user.id, userSearchText(user)); }
		return (id: string) => byId.get(id) ?? '';
	}, [otherIds, lookups, user]);
	const filtered = useMemo(
		() => (tokens ?? []).filter((token) => matchesTokenFilter(token, filter, userText)),
		[tokens, filter, userText],
	);

	if (!user) { return null; }
	const self = { id: user.id, email: user.email, firstname: user.firstname, lastname: user.lastname };
	const retry = (
		<Button type="button" variant="ghost" size="sm" onClick={() => void refetch()} disabled={isFetching}>
			<RefreshCwIcon /> Retry
		</Button>
	);

	return (
		<div className="max-w-6xl">
			<h1 className="text-2xl font-light">API Tokens</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				{canMint
					? 'Bearer tokens for scripts and automation against the Fabric API. A token acts as its owner with the role it was minted with, '
					: 'Bearer tokens a Fabric admin minted for you. A token acts as you with the role it was minted with, '}
				stops working after {STAFF_TOKEN_IDLE_DAYS} days unused, and can be revoked here at any time. Send one as{' '}
				<code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer &lt;token&gt;</code>.
			</p>

			{minted && (
				<div className="mt-6">
					<MintedTokenCard token={minted} self={self} onDismiss={() => setMinted(null)} />
				</div>
			)}

			{canMint && (
				<div className="mt-6">
					<MintStaffApiTokenForm self={self} onMinted={setMinted} holdingSecret={minted !== null} />
				</div>
			)}

			<div className="mt-8">
				<h2 className="text-lg font-light">{canMint ? 'All tokens' : 'Your tokens'}</h2>
				{/* A failed refresh keeps the last known rows, and their revoke controls, on the page. */}
				{isError && tokens && (
					<p className="mt-2 flex items-center gap-2 text-sm text-destructive">
						Couldn't refresh the list; showing the last known tokens. {retry}
					</p>
				)}
				{isLoading
					? <p className="mt-2 text-sm text-muted-foreground">Loading tokens…</p>
					: !tokens
					? (
						<p className="mt-2 flex items-center gap-2 text-sm text-destructive">
							Couldn't load tokens. {retry}
						</p>
					)
					: tokens.length === 0
					? <p className="mt-2 text-sm text-muted-foreground">No tokens yet.</p>
					: (
						<>
							<Input
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
								placeholder="Filter by name, owner, role, status or id…"
								aria-label="Filter tokens"
								className="my-4 max-w-md"
							/>
							{filtered.length === 0
								? <p className="text-sm text-muted-foreground">No tokens match “{filter}”.</p>
								: <StaffApiTokenTable tokens={filtered} self={self} />}
						</>
					)}
			</div>
		</div>
	);
}
