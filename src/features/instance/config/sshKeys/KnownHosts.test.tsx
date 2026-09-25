/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'entity-1', entityType: 'instance' }),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useSuspenseQuery: () => ({ data: { known_hosts: 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExisting\n' } }),
}));
vi.mock('@/integrations/api/instance/ssh/setSSHKnownHosts', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/ssh/setSSHKnownHosts')>()),
	useSetSSHKnownHosts: () => ({ mutate, isPending: false }),
}));

import { KnownHosts } from './KnownHosts';

afterEach(() => {
	cleanup();
	mutate.mockClear();
});

async function type(value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText('Known Hosts'), { target: { value } });
	});
}

function saveButton() {
	return screen.getByRole('button', { name: /Save Known Hosts/ }) as HTMLButtonElement;
}

describe('KnownHosts', () => {
	it.each([['nothing', ''], ['only whitespace', '  \n  ']])(
		'explains why %s is refused once the box is left, instead of saving nothing',
		async (_, value) => {
			render(<KnownHosts />);
			await type(value);
			expect(screen.queryByText('Please enter at least one known host.')).toBeNull();

			await act(async () => {
				fireEvent.blur(screen.getByLabelText('Known Hosts'));
			});

			expect(await screen.findByText('Please enter at least one known host.')).toBeTruthy();
			expect(saveButton().disabled).toBe(true);
		},
	);
});
