/**
 * @vitest-environment jsdom
 */
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatePromoCodeModal } from './CreatePromoCodeModal';

let pending = false;
const create = vi.fn();
vi.mock('@/features/admin/promoCodes/promoCodeAdminApi', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/features/admin/promoCodes/promoCodeAdminApi')>()),
	useCreatePromoCode: () => ({ mutate: create, isPending: pending }),
}));

afterEach(() => {
	cleanup();
	pending = false;
	create.mockReset();
});

const renderModal = (onClose: () => void) =>
	render(
		<TestProvider>
			<CreatePromoCodeModal kinds={['credit']} onClose={onClose} onCreated={() => {}} />
		</TestProvider>,
	);

describe('CreatePromoCodeModal', () => {
	it('stays open while a create is in flight, so its generated code is not lost', async () => {
		pending = true;
		const onClose = vi.fn();
		renderModal(onClose);
		fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
		expect(onClose).not.toHaveBeenCalled();
	});

	it('closes on Escape when nothing is in flight', async () => {
		const onClose = vi.fn();
		renderModal(onClose);
		fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
		expect(onClose).toHaveBeenCalled();
	});
});

describe('CreatePromoCodeModal cancel', () => {
	it('ignores Cancel between submit and the pending render, so a second create cannot follow', async () => {
		const onClose = vi.fn();
		renderModal(onClose);
		fireEvent.change(await screen.findByLabelText('Credit (USD)'), { target: { value: '100' } });
		fireEvent.change(screen.getByLabelText('Redeem by'), { target: { value: '2099-01-01' } });
		fireEvent.click(screen.getByRole('button', { name: 'Create code' }));
		await waitFor(() => expect(create).toHaveBeenCalled());
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onClose).not.toHaveBeenCalled();
	});
});
