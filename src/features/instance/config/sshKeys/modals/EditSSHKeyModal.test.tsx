/**
 * @vitest-environment jsdom
 */
import { EditSSHKeyModal } from '@/features/instance/config/sshKeys/modals/EditSSHKeyModal';
import { ED25519_PUBLIC_KEY, openSSHPrivateKey } from '@/integrations/api/instance/ssh/testHelpers';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { updateSSHKey } = vi.hoisted(() => ({ updateSSHKey: vi.fn() }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), loading: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'entity-1', entityType: 'instance' }),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: () => ({
		data: { name: 'website', key: 'enc:v1:sealed', host: 'website.github.com', hostname: 'github.com' },
	}),
}));
vi.mock('@/integrations/api/instance/ssh/updateSSHKey', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/ssh/updateSSHKey')>()),
	useUpdateSSHKey: () => ({ mutate: updateSSHKey, isPending: false }),
}));
vi.mock('@/integrations/api/instance/ssh/deleteSSHKey', () => ({
	useDeleteSSHKey: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderModal() {
	const noop = () => {};
	return render(
		<EditSSHKeyModal
			data={{ name: 'website', host: 'website.github.com', hostname: 'github.com' }}
			isModalOpen
			closeModal={noop}
			onSelectSSHKey={noop}
			onChangesSaved={noop}
		/>,
	);
}

async function typeKey(value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText('Key'), { target: { value } });
	});
}

function updateButton() {
	return screen.getByRole('button', { name: 'Update SSH Key' }) as HTMLButtonElement;
}

describe('EditSSHKeyModal', () => {
	it('explains why a replacement public key is refused, instead of only disabling Update', async () => {
		renderModal();
		await typeKey(ED25519_PUBLIC_KEY);

		expect(await screen.findByText(/This looks like a public key \("ssh-ed25519 …"\)/)).toBeTruthy();
		expect(updateButton().disabled).toBe(true);
	});

	it('sends a valid replacement key newline-terminated', async () => {
		renderModal();
		await typeKey(`  ${openSSHPrivateKey()}  `);
		await waitFor(() => expect(updateButton().disabled).toBe(false));

		await act(async () => {
			fireEvent.click(updateButton());
		});

		expect(updateSSHKey).toHaveBeenCalledTimes(1);
		expect(updateSSHKey.mock.calls[0][0]).toMatchObject({ name: 'website', key: openSSHPrivateKey() + '\n' });
	});
});
