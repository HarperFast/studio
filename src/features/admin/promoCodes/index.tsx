import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreatePromoCodeModal } from '@/features/admin/promoCodes/components/CreatePromoCodeModal';
import { PromoCodeRedemptionsModal } from '@/features/admin/promoCodes/components/PromoCodeRedemptionsModal';
import { getPromoCodesQueryOptions, useSetPromoCodeDisabled } from '@/features/admin/promoCodes/promoCodeAdminApi';
import { formatCents, formatDay } from '@/features/organization/billing/promoCodes/promoCodeApi';
import { useStaffPermission } from '@/hooks/useAuth';
import { useCopyTextToClipboard } from '@/hooks/useCopyToClipboard';
import { AdminPromoCode, PromoKind } from '@/integrations/api/api.patch';
import { describeError } from '@/react-query/queryClient';
import { useQuery } from '@tanstack/react-query';
import { CopyIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

function gives(code: AdminPromoCode) {
	if (code.kind === 'credit') {
		return `${formatCents(code.creditCents ?? 0)} credit, use within ${code.creditValidDays} days`;
	}
	const shape = (code.shape ?? []).map((row) => (row.regionId ? `${row.planId} in ${row.regionId}` : row.planId));
	return `Free ${shape.join(', ')} for ${code.voucherDays} days`;
}

function redeemed(code: AdminPromoCode) {
	return code.maxRedemptions == null ? `${code.redemptions}` : `${code.redemptions} of ${code.maxRedemptions}`;
}

function creditTotals(code: AdminPromoCode) {
	if (code.kind !== 'credit') { return '—'; }
	return `${formatCents(code.issuedCents)} issued · ${formatCents(code.expiredCents)} expired · up to ${
		formatCents(code.liveCreditCents)
	} live`;
}

function statusOf(code: AdminPromoCode) {
	if (code.disabledAt) { return <Badge variant="secondary">Disabled</Badge>; }
	if (new Date(code.redeemBy).getTime() <= Date.now()) { return <Badge variant="secondary">Ended</Badge>; }
	return <Badge variant="outline">Live</Badge>;
}

// A cap is soft on central manager: redemptions at the same moment can pass it, so it is flagged, not prevented.
export function PromoCodesAdminIndex() {
	const canWriteCredit = useStaffPermission('billing:write');
	const canWriteVoucher = useStaffPermission('grant:write');
	const creatable: PromoKind[] = [
		...(canWriteCredit ? ['credit' as const] : []),
		...(canWriteVoucher ? ['voucher' as const] : []),
	];
	const { data: codes, isLoading, isError } = useQuery(getPromoCodesQueryOptions());
	const [creating, setCreating] = useState(0);
	const [viewing, setViewing] = useState<AdminPromoCode | null>(null);
	const { mutate: setDisabled, isPending: switching } = useSetPromoCodeDisabled();
	const copyCode = useCopyTextToClipboard();

	const canWrite = (code: AdminPromoCode) => (code.kind === 'credit' ? canWriteCredit : canWriteVoucher);
	const toggle = (code: AdminPromoCode) =>
		setDisabled({ id: code.id, disabled: !code.disabledAt }, {
			onError: (error) => toast.error('Could not change the code', { description: describeError(error).message }),
		});

	return (
		<div className="max-w-6xl">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-light">Promo codes</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Codes an organization admin redeems under Billing. A credit code puts money on the organization&rsquo;s
						bill, used by every invoice until its use-by date; a voucher code gives a free cluster of a fixed shape.
					</p>
				</div>
				{creatable.length > 0 && (
					<Button
						variant="submit"
						onClick={() => setCreating((key) => key + 1)}
						className="shrink-0"
					>
						<PlusIcon />
						Create code
					</Button>
				)}
			</div>

			<div className="mt-6">
				{isLoading
					? <p className="text-sm text-muted-foreground">Loading promo codes…</p>
					: isError
					? <p className="text-sm text-destructive">Could not load promo codes.</p>
					: !codes?.length
					? <p className="text-sm text-muted-foreground">No promo codes yet.</p>
					: (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Code</TableHead>
									<TableHead>Gives</TableHead>
									<TableHead>Redeem by</TableHead>
									<TableHead>Redeemed</TableHead>
									<TableHead>Credit</TableHead>
									<TableHead>Status</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{codes.map((code) => (
									<TableRow key={code.id}>
										<TableCell className="font-mono">
											<div className="flex items-center gap-1.5">
												{code.id}
												<Button
													type="button"
													size="sm"
													variant="ghost"
													className="h-6 w-6 p-0 shrink-0"
													aria-label={`Copy ${code.id}`}
													onClick={() => copyCode(code.id)}
												>
													<CopyIcon className="w-3.5 h-3.5" aria-hidden="true" />
												</Button>
											</div>
											{code.campaign && <div className="text-xs text-muted-foreground font-sans">{code.campaign}</div>}
										</TableCell>
										<TableCell>{gives(code)}</TableCell>
										<TableCell>{formatDay(code.redeemBy)}</TableCell>
										<TableCell>
											{code.redemptions > 0
												? (
													<Button
														variant="link"
														className="h-auto p-0"
														aria-label={`See who redeemed ${code.id}`}
														onClick={() => setViewing(code)}
													>
														{redeemed(code)}
													</Button>
												)
												: redeemed(code)}
											{code.overCap && (
												<Badge
													variant="destructive"
													className="ml-2"
													title="Redemptions at the same moment passed the cap"
												>
													Over cap
												</Badge>
											)}
										</TableCell>
										<TableCell className="text-xs">{creditTotals(code)}</TableCell>
										<TableCell>{statusOf(code)}</TableCell>
										<TableCell className="text-right">
											{canWrite(code) && (
												<Button
													variant="ghost"
													size="sm"
													disabled={switching}
													onClick={() => toggle(code)}
												>
													{code.disabledAt ? 'Enable' : 'Disable'}
												</Button>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
			</div>

			{viewing && <PromoCodeRedemptionsModal code={viewing.id} kind={viewing.kind} onClose={() => setViewing(null)} />}

			{creating > 0 && (
				<CreatePromoCodeModal
					key={creating}
					kinds={creatable}
					onClose={() => setCreating(0)}
					onCreated={(code) =>
						toast.success('Promo code created', { description: `${code.id} — share it as written.` })}
				/>
			)}
		</div>
	);
}
