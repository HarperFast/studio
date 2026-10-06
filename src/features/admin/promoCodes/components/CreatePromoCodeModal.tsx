import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GrantShapeFields } from '@/features/admin/grants/components/GrantShapeFields';
import { CreatePromoCodeBody, useCreatePromoCode } from '@/features/admin/promoCodes/promoCodeAdminApi';
import {
	CreatePromoCodeSchema,
	CreatePromoCodeValues,
	endOfDay,
	MAX_CREDIT_DOLLARS,
} from '@/features/admin/promoCodes/PromoCodeFormSchema';
import { AdminPromoCode, PromoKind } from '@/integrations/api/api.patch';
import { describeError } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export function toCreateBody(values: CreatePromoCodeValues): CreatePromoCodeBody {
	return {
		...(values.code ? { code: values.code.toUpperCase() } : {}),
		kind: values.kind,
		redeemBy: endOfDay(values.redeemBy).toISOString(),
		...(values.maxRedemptions ? { maxRedemptions: Number(values.maxRedemptions) } : {}),
		...(values.kind === 'credit'
			? { creditCents: Math.round(Number(values.creditDollars) * 100), creditValidDays: Number(values.creditValidDays) }
			: {
				shape: values.shape.map((row) => ({ planId: row.planId, regionId: row.regionId || null })),
				voucherDays: Number(values.voucherDays),
			}),
		...(values.campaign.trim() ? { campaign: values.campaign.trim() } : {}),
	};
}

/**
 * Create a promo code. The dialog cannot close while a create is in flight: closing unmounts it, which
 * drops the result toast and lets a second create start before the first has answered.
 */
export function CreatePromoCodeModal({ kinds, onClose, onCreated }: {
	kinds: PromoKind[];
	onClose: () => void;
	onCreated: (code: AdminPromoCode) => void;
}) {
	const { mutate, isPending } = useCreatePromoCode();
	const inFlight = useRef(false);
	const form = useForm<CreatePromoCodeValues>({
		resolver: zodResolver(CreatePromoCodeSchema),
		defaultValues: {
			kind: kinds[0],
			code: '',
			redeemBy: '',
			maxRedemptions: '',
			creditDollars: '',
			creditValidDays: '90',
			shape: [],
			voucherDays: '30',
			campaign: '',
		},
	});
	const kind = form.watch('kind');

	const onSubmit = (values: CreatePromoCodeValues) => {
		const body = toCreateBody(values);
		if (inFlight.current) { return; }
		inFlight.current = true;
		mutate(body, {
			onSuccess: (created) => {
				onCreated(created);
				onClose();
			},
			onError: (error) => toast.error('Could not create the code', { description: describeError(error).message }),
			onSettled: () => {
				inFlight.current = false;
			},
		});
	};

	return (
		<Dialog open onOpenChange={(open) => !open && !isPending && !inFlight.current && onClose()}>
			<DialogContent className="max-w-lg">
				<DialogTitle>Create promo code</DialogTitle>
				<DialogDescription>
					A code an organization admin redeems under Billing, for money off its bills or a free cluster. What it gives
					cannot change later; disable it and create another instead.
				</DialogDescription>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
						<div className="grid grid-cols-2 gap-3">
							<FormField
								control={form.control}
								name="kind"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Gives</FormLabel>
										<FormControl>
											<Select value={field.value} onValueChange={field.onChange} disabled={kinds.length < 2}>
												<SelectTrigger className="w-full" aria-label="Gives">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{kinds.includes('credit') && <SelectItem value="credit">Credit on the bill</SelectItem>}
													{kinds.includes('voucher') && <SelectItem value="voucher">A free cluster</SelectItem>}
												</SelectContent>
											</Select>
										</FormControl>
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="code"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Code</FormLabel>
										<FormControl>
											<Input placeholder="Empty generates one" autoComplete="off" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{kind === 'credit'
							? (
								<div className="grid grid-cols-2 gap-3">
									<FormField
										control={form.control}
										name="creditDollars"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Credit (USD)</FormLabel>
												<FormControl>
													<Input
														type="number"
														inputMode="decimal"
														min={1}
														max={MAX_CREDIT_DOLLARS}
														step="0.01"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="creditValidDays"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Use within (days)</FormLabel>
												<FormControl>
													<Input type="number" inputMode="numeric" min={1} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							)
							: (
								<>
									<GrantShapeFields enabled />
									<FormField
										control={form.control}
										name="voucherDays"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Free for (days)</FormLabel>
												<FormControl>
													<Input type="number" inputMode="numeric" min={1} {...field} />
												</FormControl>
												<p className="text-xs text-muted-foreground">Counted from when the code is redeemed.</p>
												<FormMessage />
											</FormItem>
										)}
									/>
								</>
							)}

						<div className="grid grid-cols-2 gap-3">
							<FormField
								control={form.control}
								name="redeemBy"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Redeem by</FormLabel>
										<FormControl>
											<Input type="date" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="maxRedemptions"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Most redemptions</FormLabel>
										<FormControl>
											<Input type="number" inputMode="numeric" min={1} placeholder="No cap" {...field} />
										</FormControl>
										<p className="text-xs text-muted-foreground">
											Redemptions at the same moment can go slightly over; the list flags it.
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="campaign"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Campaign</FormLabel>
									<FormControl>
										<Input placeholder="Optional, for reporting" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
							<Button type="submit" variant="submit" disabled={isPending}>
								{isPending ? 'Creating…' : 'Create code'}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
