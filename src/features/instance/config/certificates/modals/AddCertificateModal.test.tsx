/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'entity-1', entityType: 'instance' }),
}));
vi.mock('@/integrations/api/instance/certificates/useAddCertificate', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/certificates/useAddCertificate')>()),
	useAddCertificate: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AddCertificateModal } from './AddCertificateModal';

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

async function type(label: string, value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText(label), { target: { value } });
	});
}

async function leave(label: string) {
	await act(async () => {
		fireEvent.blur(screen.getByLabelText(label));
	});
}

describe('AddCertificateModal', () => {
	it('says Name is required when Enter is pressed in it', async () => {
		render(<AddCertificateModal isModalOpen onChangesSaved={() => {}} setIsModalOpen={() => {}} />);
		await type('Name', 'x');
		await type('Name', '');
		await act(async () => {
			fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Enter' });
		});

		expect(await screen.findByText('Name is required')).toBeTruthy();
	});

	it.each([
		['Name', 'Name is required'],
		['Certificate', 'Certificate is required'],
	])('says %s is required once it is cleared and left, while Add is disabled', async (label, message) => {
		render(<AddCertificateModal isModalOpen onChangesSaved={() => {}} setIsModalOpen={() => {}} />);
		await type(label, 'x');
		await type(label, '');
		expect(screen.queryByText(message)).toBeNull();

		await leave(label);

		expect(await screen.findByText(message)).toBeTruthy();
		expect((screen.getByRole('button', { name: /Add Certificate/ }) as HTMLButtonElement).disabled).toBe(true);
	});
});
