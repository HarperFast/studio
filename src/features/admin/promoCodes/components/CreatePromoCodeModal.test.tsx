/**
 * @vitest-environment jsdom
 */
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatePromoCodeModal } from './CreatePromoCodeModal';

let pending = false;
vi.mock('@/features/admin/promoCodes/promoCodeAdminApi', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/features/admin/promoCodes/promoCodeAdminApi')>()),
	useCreatePromoCode: () => ({ mutate: vi.fn(), isPending: pending }),
}));

afterEach(() => {
	cleanup();
	pending = false;
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
