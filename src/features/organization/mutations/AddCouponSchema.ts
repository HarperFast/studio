import { z } from 'zod';

export const AddCouponSchema = z.object({
	couponId: z
		.string()
		.nonempty({
			message: 'Please enter a coupon ID.',
		})
		.trim(),
});

export type AddCouponType = z.infer<typeof AddCouponSchema>;
