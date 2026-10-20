import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RevokeApiTokenButton } from '@/features/organization/serviceAccounts/components/RevokeApiTokenButton';
import { Timestamp } from '@/features/organization/serviceAccounts/components/Timestamp';
import { CreateApiTokenModal } from '@/features/organization/serviceAccounts/modals/CreateApiTokenModal';
import { getServiceAccountTokensQueryOptions } from '@/features/organization/serviceAccounts/queries/serviceAccounts';
import { OrganizationApiToken, ServiceAccount } from '@/integrations/api/api.patch';
import { cn } from '@/lib/cn';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

function TokenExpiry({ token, now }: { token: OrganizationApiToken; now: number }) {
	const remainingMs = new Date(token.expiresAt).getTime() - now;
	if (remainingMs <= 0) {
		return (
			<span className="text-red-500">
				Expired <Timestamp value={token.expiresAt} format="relative" className="lowercase" />
			</span>
		);
	}
	return (
		<Timestamp
			value={token.expiresAt}
			format="relative"
			className={cn(remainingMs < EXPIRY_WARNING_MS && 'text-amber-600')}
		/>
	);
}

function TokenCreator({ token }: { token: OrganizationApiToken }) {
	if (!token.createdByUserId) {
		return <span className="text-muted-foreground">—</span>;
	}
	if (!token.createdByEmail) {
		return <span className="font-mono text-xs text-muted-foreground">{token.createdByUserId}</span>;
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
					{token.createdByEmail}
				</span>
			</TooltipTrigger>
			<TooltipContent>{token.createdByUserId}</TooltipContent>
		</Tooltip>
	);
}

export function ServiceAccountTokens(
	{ organizationId, account, regionId }: { organizationId: string; account: ServiceAccount; regionId: string },
) {
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const { data: tokens, isLoading, isError } = useQuery(
		getServiceAccountTokensQueryOptions(organizationId, account.id),
	);
	const isActive = account.status === 'ACTIVE';
	const now = Date.now();

	return (
		<section
			id={regionId}
			aria-label={`API tokens of ${account.name}`}
			className="mt-4 rounded-lg border border-primary/30 bg-primary/5 dark:border-white/15 dark:bg-white/5"
		>
			<div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
				<div className="min-w-0">
					<h4 className="font-medium text-foreground truncate">{account.name}</h4>
					<p className="text-xs text-muted-foreground">API tokens</p>
				</div>
				<Button
					variant="positiveOutline"
					size="sm"
					onClick={() => setIsCreateOpen(true)}
					disabled={!isActive}
				>
					<PlusIcon />
					Create token
				</Button>
			</div>
			{!account.roleName && (
				<p className="px-4 pt-3 text-sm text-red-500">
					Its role was deleted; change it from the account’s menu, or its tokens are refused.
				</p>
			)}
			{!isActive && (
				<p className="px-4 pt-3 text-sm text-muted-foreground">
					While the account is disabled its tokens are refused; enabling it restores those not revoked or expired.
				</p>
			)}
			<div className="px-4 pb-2">
				{isLoading
					? <Loading className="py-6" />
					: isError && !tokens
					? <p className="py-4 text-sm text-red-500">Couldn’t load this account’s tokens.</p>
					: !tokens?.length
					? <p className="py-4 text-sm text-muted-foreground">No tokens yet.</p>
					: (
						<Table>
							<TableHeader>
								<TableRow className="border-border">
									<TableHead>Name</TableHead>
									<TableHead>Created by</TableHead>
									<TableHead>Created</TableHead>
									<TableHead>Expires</TableHead>
									<TableHead>Last used</TableHead>
									<TableHead>
										<span className="sr-only">Actions</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{tokens.map((token) => (
									<TableRow key={token.id} className="border-border">
										<TableCell className="py-2.5 font-medium">{token.name}</TableCell>
										<TableCell className="py-2.5">
											<TokenCreator token={token} />
										</TableCell>
										<TableCell className="py-2.5 whitespace-nowrap">
											<Timestamp value={token.createdAt} format="date" />
										</TableCell>
										<TableCell className="py-2.5 whitespace-nowrap">
											<TokenExpiry token={token} now={now} />
										</TableCell>
										<TableCell className="py-2.5 whitespace-nowrap">
											{token.lastUsedAt
												? <Timestamp value={token.lastUsedAt} format="relative" />
												: <span className="text-muted-foreground">Not used yet</span>}
										</TableCell>
										<TableCell className="py-2.5 text-right">
											<RevokeApiTokenButton token={token} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
			</div>
			{isCreateOpen && (
				<CreateApiTokenModal
					organizationId={organizationId}
					serviceAccountId={account.id}
					onClose={() => setIsCreateOpen(false)}
				/>
			)}
		</section>
	);
}
