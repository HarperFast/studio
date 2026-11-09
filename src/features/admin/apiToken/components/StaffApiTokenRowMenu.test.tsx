/** @vitest-environment jsdom */
import { StaffApiToken } from '@/integrations/api/api.patch';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mutate, copyText } = vi.hoisted(() => ({ mutate: vi.fn(), copyText: vi.fn() }));
vi.mock('@/features/admin/apiToken/mutations/useRevokeApiToken', () => ({
	useRevokeApiTokenMutation: () => ({ mutate, isPending: false }),
}));
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyTextToClipboard: () => copyText }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { StaffApiTokenRowMenu } from './StaffApiTokenRowMenu';

const token = (status: StaffApiToken['status']): StaffApiToken => ({
	id: 'sat-1',
	name: 'nightly',
	role: 'fabric_readonly',
	ownerUserId: 'usr-1',
	createdByUserId: 'usr-admin',
	createdAt: '2026-10-21T00:00:00.000Z',
	expiresAt: '2026-11-04T00:00:00.000Z',
	lastUsedAt: null,
	revokedAt: null,
	status,
});

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	window.PointerEvent ??= class extends MouseEvent {} as typeof PointerEvent;
});

beforeEach(() => {
	mutate.mockReset();
	copyText.mockReset();
});

afterEach(cleanup);

// Radix opens its menu on pointerdown, not click.
async function openMenu() {
	await act(async () => {
		fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for nightly' }), { button: 0, ctrlKey: false });
	});
	return screen.getByRole('menu');
}

async function confirmRevokeTwice() {
	const menu = await openMenu();
	await act(async () => {
		fireEvent.click(within(menu).getByRole('menuitem', { name: /Revoke/ }));
	});
	const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: /Revoke/ });
	await act(async () => {
		fireEvent.click(confirm);
		fireEvent.click(confirm);
	});
}

describe('StaffApiTokenRowMenu', () => {
	it('offers Revoke only for a live token', async () => {
		render(<StaffApiTokenRowMenu token={token('revoked')} />);
		const menu = await openMenu();

		expect(within(menu).getByRole('menuitem', { name: /Copy token ID/ })).toBeDefined();
		expect(within(menu).queryByRole('menuitem', { name: /Revoke/ })).toBeNull();
	});

	it('copies the token id', async () => {
		render(<StaffApiTokenRowMenu token={token('active')} />);
		const menu = await openMenu();

		await act(async () => {
			fireEvent.click(within(menu).getByRole('menuitem', { name: /Copy token ID/ }));
		});

		expect(copyText).toHaveBeenCalledWith('sat-1');
	});

	it('sends one revoke for two quick confirms', async () => {
		render(<StaffApiTokenRowMenu token={token('active')} />);

		await confirmRevokeTwice();

		expect(mutate).toHaveBeenCalledTimes(1);
		expect(mutate.mock.calls[0][0]).toBe('sat-1');
	});

	it('allows another revoke once the first has settled', async () => {
		mutate.mockImplementationOnce((_id, { onSettled }) => onSettled());
		render(<StaffApiTokenRowMenu token={token('active')} />);

		await confirmRevokeTwice();

		expect(mutate).toHaveBeenCalledTimes(2);
	});
});
