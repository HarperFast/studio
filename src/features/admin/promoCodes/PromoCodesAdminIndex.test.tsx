/**
 * @vitest-environment jsdom
 */
import { AdminPromoCode } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromoCodesAdminIndex } from './index';

let granted: string[] = [];
vi.mock('@/hooks/useAuth', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/hooks/useAuth')>()),
	useStaffPermission: (permission: string) => granted.includes(permission),
}));

let codes: AdminPromoCode[] = [];
const setDisabled = vi.fn();
vi.mock('./promoCodeAdminApi', async (importOriginal) => ({
	...(await importOriginal<typeof import('./promoCodeAdminApi')>()),
	getPromoCodesQueryOptions: () => ({
		queryKey: ['test-promo-codes', JSON.stringify(codes)],
		queryFn: async () => codes,
		retry: false,
	}),
	useSetPromoCodeDisabled: () => ({ mutate: setDisabled, isPending: false }),
	getPromoCodeQueryOptions: (id: string) => ({
		queryKey: ['test-promo-code', id],
		queryFn: async () => ({ id, redemptionList: [] }),
		retry: false,
	}),
}));

afterEach(() => {
	cleanup();
	granted = [];
	codes = [];
	setDisabled.mockReset();
});

const code = (overrides: Partial<AdminPromoCode>): AdminPromoCode => ({
	id: 'WELCOME100',
	kind: 'credit',
	redeemBy: '2099-12-31T23:59:59Z',
	maxRedemptions: null,
	disabledAt: null,
	creditCents: 10_000,
	creditValidDays: 90,
	shape: null,
	voucherDays: null,
	campaign: null,
	createdByUserId: 'staff-1',
	createdAt: '2026-10-01T00:00:00Z',
	redemptions: 0,
	issuedCents: 0,
	expiredCents: 0,
	liveCreditCents: 0,
	overCap: false,
	...overrides,
});

const renderPage = () =>
	render(
		<TestProvider>
			<PromoCodesAdminIndex />
		</TestProvider>,
	);

describe('PromoCodesAdminIndex', () => {
	it('shows what each code gives, its redemptions against the cap, and flags a code past it', async () => {
		codes = [
			code({
				redemptions: 3,
				maxRedemptions: 2,
				overCap: true,
				issuedCents: 30_000,
				expiredCents: 2_500,
				liveCreditCents: 20_000,
			}),
			code({
				id: 'LAUNCH-30DAYS',
				kind: 'voucher',
				creditCents: null,
				creditValidDays: null,
				shape: [{ planId: 'hobbyist', regionId: 'us-east' }],
				voucherDays: 30,
			}),
		];
		renderPage();
		expect(await screen.findByText(/credit, use within 90 days/)).toBeTruthy();
		expect(screen.getByText('3 of 2')).toBeTruthy();
		expect(screen.getByText('Over cap')).toBeTruthy();
		expect(screen.getByText('Free hobbyist in us-east for 30 days')).toBeTruthy();
	});

	it('offers create and disable only for the kinds the account may write', async () => {
		codes = [code({}), code({ id: 'LAUNCH-30DAYS', kind: 'voucher', shape: [], voucherDays: 30 })];
		granted = ['grant:write'];
		renderPage();
		await screen.findByText('LAUNCH-30DAYS');
		expect(screen.getByRole('button', { name: /Create code/ })).toBeTruthy();
		const disables = screen.getAllByRole('button', { name: 'Disable' });
		expect(disables).toHaveLength(1);
		fireEvent.click(disables[0]);
		expect(setDisabled).toHaveBeenCalledWith({ id: 'LAUNCH-30DAYS', disabled: true }, expect.anything());
	});

	it('has no create button for an account that may write neither kind', async () => {
		codes = [code({ disabledAt: '2026-10-02T00:00:00Z' })];
		renderPage();
		expect(await screen.findByText('Disabled')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Create code/ })).toBeNull();
	});

	it('copies a code exactly as it is shared', async () => {
		const writeText = vi.fn(async () => undefined);
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
		codes = [code({ id: 'DEMO-CREDIT-100' })];
		renderPage();
		fireEvent.click(await screen.findByRole('button', { name: 'Copy DEMO-CREDIT-100' }));
		expect(writeText).toHaveBeenCalledWith('DEMO-CREDIT-100');
	});

	it('expands a code’s row to show who redeemed it, and has nothing to expand for an unredeemed one', async () => {
		granted = ['billing:read'];
		codes = [code({ id: 'USED-CODE1', redemptions: 2 }), code({ id: 'FRESH-CODE1', redemptions: 0 })];
		renderPage();
		const toggle = await screen.findByRole('button', { name: 'Show redemptions of USED-CODE1' });
		fireEvent.click(toggle);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(await screen.findByText('No organization has redeemed this code yet.')).toBeTruthy();
		expect(screen.queryByRole('dialog')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Hide redemptions of USED-CODE1' }));
		expect(screen.queryByText('No organization has redeemed this code yet.')).toBeNull();
		expect(screen.getByRole('button', { name: 'Show redemptions of FRESH-CODE1' }).hasAttribute('disabled')).toBe(true);
	});
});
