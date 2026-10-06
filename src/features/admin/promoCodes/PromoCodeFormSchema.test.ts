import { toCreateBody } from '@/features/admin/promoCodes/components/CreatePromoCodeModal';
import { describe, expect, it } from 'vitest';
import { CreatePromoCodeSchema, CreatePromoCodeValues } from './PromoCodeFormSchema';

const base: CreatePromoCodeValues = {
	kind: 'credit',
	code: '',
	redeemBy: '2099-12-31',
	maxRedemptions: '',
	creditDollars: '100',
	creditValidDays: '90',
	shape: [],
	voucherDays: '30',
	campaign: '',
};
const issues = (values: Partial<CreatePromoCodeValues>) => {
	const result = CreatePromoCodeSchema.safeParse({ ...base, ...values });
	return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('CreatePromoCodeSchema', () => {
	it('accepts a credit code with a generated code', () => {
		expect(issues({})).toEqual([]);
	});

	it('refuses what central manager would refuse', () => {
		expect(issues({ code: 'SHORT' })).toEqual(['code']);
		expect(issues({ creditDollars: '1000.01' })).toEqual(['creditDollars']);
		expect(issues({ creditDollars: '10.005' })).toEqual(['creditDollars']);
		expect(issues({ redeemBy: '2000-01-01' })).toEqual(['redeemBy']);
		expect(issues({ maxRedemptions: '0' })).toEqual(['maxRedemptions']);
		expect(issues({ kind: 'voucher' })).toEqual(['shape']);
		expect(issues({ kind: 'voucher', shape: [{ planId: 'hobbyist', regionId: '' }] })).toEqual(['shape.0.regionId']);
	});
});

describe('toCreateBody', () => {
	it('sends a credit in cents and the redeem-by day to its end', () => {
		const body = toCreateBody({ ...base, code: 'welcome100', creditDollars: '19.99', maxRedemptions: '50' });
		expect(body).toMatchObject({
			code: 'WELCOME100',
			kind: 'credit',
			creditCents: 1999,
			creditValidDays: 90,
			maxRedemptions: 50,
		});
		expect(new Date(body.redeemBy).getHours()).toBe(23);
		expect(body).not.toHaveProperty('shape');
	});

	it('sends a voucher’s shape with a self-hosted region as null, and nothing of a credit', () => {
		const body = toCreateBody({
			...base,
			kind: 'voucher',
			shape: [{ planId: 'hobbyist', regionId: 'us-east' }, { planId: 'self-hosted-2', regionId: '' }],
		});
		expect(body).toMatchObject({
			kind: 'voucher',
			voucherDays: 30,
			shape: [{ planId: 'hobbyist', regionId: 'us-east' }, { planId: 'self-hosted-2', regionId: null }],
		});
		expect(body).not.toHaveProperty('creditCents');
		expect(body).not.toHaveProperty('code');
	});
});
