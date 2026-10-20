/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/features/organization/serviceAccounts/mutations/revokeOrganizationApiToken', () => ({
	useRevokeOrganizationApiTokenMutation: () => ({ mutate, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RevokeApiTokenButton } from './RevokeApiTokenButton';

const token = {
	id: 'oat-1',
	name: 'deploy',
	serviceAccountId: 'sva-1',
	organizationId: 'org-1',
	createdAt: '2026-10-06T00:00:00.000Z',
	expiresAt: '2026-11-05T00:00:00.000Z',
	lastUsedAt: null,
	createdByUserId: 'usr-1',
};

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
	mutate.mockReset();
});

afterEach(cleanup);

async function openAndConfirmTwice() {
	render(<RevokeApiTokenButton token={token} />);
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: 'Revoke deploy' }));
	});
	const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: /Revoke/ });
	await act(async () => {
		fireEvent.click(confirm);
		fireEvent.click(confirm);
	});
}

describe('RevokeApiTokenButton', () => {
	it('sends one revoke for two quick confirms', async () => {
		await openAndConfirmTwice();
		expect(mutate).toHaveBeenCalledTimes(1);
		expect(mutate.mock.calls[0][0]).toEqual({ tokenId: 'oat-1' });
	});

	it('allows another revoke once the first has settled', async () => {
		mutate.mockImplementationOnce((_variables, { onSettled }) => onSettled());
		await openAndConfirmTwice();
		expect(mutate).toHaveBeenCalledTimes(2);
	});
});
