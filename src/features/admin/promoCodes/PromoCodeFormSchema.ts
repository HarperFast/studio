import { addShapeIssues, ShapeRowSchema } from '@/features/admin/grants/GrantFormSchema';
import { z } from 'zod';

/** Mirrors central-manager's rules for a code: 8–32 letters, digits or dashes, stored upper-case. */
const PROMO_CODE_PATTERN = /^[A-Z0-9-]{8,32}$/;
/** Mirrors central-manager's cap: a typo in a credit amount mints real money for every redeemer. */
export const MAX_CREDIT_DOLLARS = 1000;

// Bounded because a long enough number becomes Infinity, which JSON sends as null: no cap at all.
const positiveWhole = (raw: string) => /^\d{1,9}$/.test(raw.trim()) && Number(raw) >= 1;
// Read as text: binary floating point makes 19.99 * 100 come out as 1998.9999…
const DOLLARS_TO_THE_CENT = /^\d+(\.\d{1,2})?$/;

/** The moment a redeem-by day ends in the creator's time zone, which is what central manager is sent. */
export const endOfDay = (day: string) => new Date(`${day}T23:59:59.999`);

export const CreatePromoCodeSchema = z
	.object({
		kind: z.enum(['credit', 'voucher']),
		/** Empty lets central manager generate one. */
		code: z.string().trim(),
		redeemBy: z.string().min(1, 'Choose the last day the code can be redeemed'),
		maxRedemptions: z.string(),
		creditDollars: z.string(),
		creditValidDays: z.string(),
		shape: z.array(ShapeRowSchema),
		voucherDays: z.string(),
		campaign: z.string().max(128, 'Keep the campaign under 128 characters'),
	})
	.superRefine((values, ctx) => {
		if (values.code && !PROMO_CODE_PATTERN.test(values.code.toUpperCase())) {
			ctx.addIssue({ code: 'custom', path: ['code'], message: '8 to 32 letters, digits or dashes' });
		}
		if (values.redeemBy) {
			const ends = endOfDay(values.redeemBy).getTime();
			if (Number.isNaN(ends)) {
				ctx.addIssue({ code: 'custom', path: ['redeemBy'], message: "That date isn't valid" });
			} else if (ends <= Date.now()) {
				ctx.addIssue({ code: 'custom', path: ['redeemBy'], message: 'Must be today or later' });
			}
		}
		if (values.maxRedemptions && !positiveWhole(values.maxRedemptions)) {
			ctx.addIssue({
				code: 'custom',
				path: ['maxRedemptions'],
				message: 'A whole number of at least 1, or empty for no cap',
			});
		}
		if (values.kind === 'credit') {
			const dollars = Number(values.creditDollars);
			if (!DOLLARS_TO_THE_CENT.test(values.creditDollars.trim()) || dollars < 1 || dollars > MAX_CREDIT_DOLLARS) {
				ctx.addIssue({
					code: 'custom',
					path: ['creditDollars'],
					message: `Between $1 and $${MAX_CREDIT_DOLLARS}, to the cent`,
				});
			}
			if (!positiveWhole(values.creditValidDays) || Number(values.creditValidDays) > 730) {
				ctx.addIssue({ code: 'custom', path: ['creditValidDays'], message: 'Between 1 and 730 days' });
			}
		} else {
			if (values.shape.length === 0) {
				ctx.addIssue({ code: 'custom', path: ['shape'], message: 'Say which cluster the voucher is for' });
			}
			addShapeIssues(values.shape, ctx);
			if (!positiveWhole(values.voucherDays) || Number(values.voucherDays) > 366) {
				ctx.addIssue({ code: 'custom', path: ['voucherDays'], message: 'Between 1 and 366 days' });
			}
		}
	});

export type CreatePromoCodeValues = z.infer<typeof CreatePromoCodeSchema>;
