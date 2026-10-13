import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getPromoCodeQueryOptions } from '@/features/admin/promoCodes/promoCodeAdminApi';
import { formatCents, formatDay } from '@/features/organization/billing/promoCodes/promoCodeApi';
import { AdminPromoRedemption, PromoKind } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

const STATUS_LABEL: Record<AdminPromoRedemption['status'], string> = {
	CLAIMED: 'Being added',
	APPLIED: 'Applied',
	FAILED: 'Failed',
	EXPIRED: 'Expired',
};

function gave(kind: PromoKind, redemption: AdminPromoRedemption) {
	if (kind === 'credit') {
		if (redemption.creditCents == null) { return '—'; }
		const amount = formatCents(redemption.creditCents);
		if (redemption.status === 'EXPIRED') {
			return `${amount}; ${formatCents(redemption.expiredCents ?? 0)} expired unused`;
		}
		return redemption.creditExpiresAt ? `${amount}, use by ${formatDay(redemption.creditExpiresAt)}` : amount;
	}
	if (redemption.clusterId) {
		return (
			<>
				In use by{' '}
				<Link to={`/${redemption.organizationId}/${redemption.clusterId}`} className="font-mono underline">
					{redemption.clusterId}
				</Link>
			</>
		);
	}
	if (!redemption.voucherEndsAt) { return '—'; }
	const ended = new Date(redemption.voucherEndsAt).getTime() <= Date.now();
	return `Unclaimed, ${ended ? 'ended' : 'ends'} ${formatDay(redemption.voucherEndsAt)}`;
}

/**
 * Who redeemed one code, shown under its row in the staff list. Remaining credit is not here: each
 * organization sees it under its own Billing page.
 */
export function PromoCodeRedemptions({ code, kind }: { code: string; kind: PromoKind }) {
	const { data, isLoading, isError } = useQuery(getPromoCodeQueryOptions(code));
	const redemptions = data?.redemptionList ?? [];

	return (
		<div className="flex max-w-5xl flex-col gap-2 py-3 pr-4 pl-6">
			{isLoading
				? <p className="text-sm text-muted-foreground">Loading redemptions…</p>
				: isError
				? <p className="text-sm text-destructive">Could not load the redemptions.</p>
				: redemptions.length === 0
				? <p className="text-sm text-muted-foreground">No organization has redeemed this code yet.</p>
				: (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Organization</TableHead>
								<TableHead>Redeemed by</TableHead>
								<TableHead>When</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>{kind === 'credit' ? 'Credit' : 'Free cluster'}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{redemptions.map((redemption) => (
								<TableRow key={redemption.id}>
									<TableCell>
										<Link to={`/${redemption.organizationId}`} className="underline">
											{redemption.organizationName ?? redemption.organizationId}
										</Link>
										{redemption.organizationName && (
											<div className="font-mono text-xs text-muted-foreground">{redemption.organizationId}</div>
										)}
									</TableCell>
									<TableCell>{redemption.redeemedByEmail ?? redemption.redeemedByUserId ?? '—'}</TableCell>
									<TableCell>{formatDay(redemption.redeemedAt)}</TableCell>
									<TableCell>
										<Badge
											variant={redemption.status === 'FAILED'
												? 'destructive'
												: redemption.status === 'APPLIED'
												? 'outline'
												: 'secondary'}
										>
											{STATUS_LABEL[redemption.status]}
										</Badge>
									</TableCell>
									<TableCell>{gave(kind, redemption)}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
		</div>
	);
}
