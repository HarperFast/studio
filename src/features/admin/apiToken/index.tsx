import { Input } from '@/components/ui/input';
import { MintedTokenCard } from '@/features/admin/apiToken/components/MintedTokenCard';
import { MintStaffApiTokenForm } from '@/features/admin/apiToken/components/MintStaffApiTokenForm';
import { StaffApiTokenTable } from '@/features/admin/apiToken/components/StaffApiTokenTable';
import { getStaffApiTokensQueryOptions } from '@/features/admin/apiToken/queries/getStaffApiTokens';
import { STAFF_TOKEN_IDLE_DAYS } from '@/features/admin/apiToken/staffTokenRoles';
import { useCloudAuth, useStaffPermission } from '@/hooks/useAuth';
import { MintedStaffApiToken, StaffApiToken } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

function matchesTokenFilter(token: StaffApiToken, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) { return true; }
	return [token.name, token.role, token.status, token.ownerUserId, token.createdByUserId].some((value) =>
		value.toLowerCase().includes(q)
	);
}

export function ApiTokenIndex() {
	const { user } = useCloudAuth();
	const canMint = useStaffPermission('apiToken:create');
	const { data: tokens, isLoading, isError } = useQuery(getStaffApiTokensQueryOptions());
	const [minted, setMinted] = useState<MintedStaffApiToken | null>(null);
	const [filter, setFilter] = useState('');
	const filtered = useMemo(() => (tokens ?? []).filter((token) => matchesTokenFilter(token, filter)), [tokens, filter]);

	if (!user) { return null; }
	const self = { id: user.id, email: user.email, firstname: user.firstname, lastname: user.lastname };

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
					<MintedTokenCard token={minted} selfId={user.id} onDismiss={() => setMinted(null)} />
				</div>
			)}

			{canMint && (
				<div className="mt-6">
					<MintStaffApiTokenForm self={self} onMinted={setMinted} />
				</div>
			)}

			<div className="mt-8">
				<h2 className="text-lg font-light">{canMint ? 'All tokens' : 'Your tokens'}</h2>
				{isLoading
					? <p className="mt-2 text-sm text-muted-foreground">Loading tokens…</p>
					: isError
					? <p className="mt-2 text-sm text-destructive">Couldn't load tokens.</p>
					: !tokens || tokens.length === 0
					? <p className="mt-2 text-sm text-muted-foreground">No tokens yet.</p>
					: (
						<>
							<Input
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
								placeholder="Filter by name, role, status or user id…"
								aria-label="Filter tokens"
								className="my-4 max-w-md"
							/>
							{filtered.length === 0
								? <p className="text-sm text-muted-foreground">No tokens match “{filter}”.</p>
								: <StaffApiTokenTable tokens={filtered} selfId={user.id} />}
						</>
					)}
			</div>
		</div>
	);
}
