/**
 * @vitest-environment jsdom
 */
import { ConfigSSHKeysIndex } from '@/features/instance/config/sshKeys';
import type { SSHKeyName } from '@/integrations/api/instance/ssh/listSSHKeys';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { listQuery, addModalProps } = vi.hoisted(() => ({
	listQuery: { current: {} as { data?: SSHKeyName[]; isLoading: boolean; isError?: boolean } },
	addModalProps: [] as Array<{ existingKeys?: readonly SSHKeyName[] }>,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: () => ({ isFetching: false, isRefetching: false, refetch: vi.fn(), ...listQuery.current }),
}));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
	useNavigate: () => vi.fn(),
	useParams: () => ({}),
}));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'entity-1', entityType: 'instance' }),
}));
vi.mock('@/components/SimpleBrowseDataTable', () => ({
	SimpleBrowseDataTable: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('./KnownHosts', () => ({ KnownHosts: () => null }));
vi.mock('./modals/EditSSHKeyModal', () => ({ EditSSHKeyModal: () => null }));
vi.mock('./modals/AddSSHKeyModal', () => ({
	AddSSHKeyModal: (props: { existingKeys?: readonly SSHKeyName[] }) => {
		addModalProps.push(props);
		return null;
	},
}));

afterEach(() => {
	cleanup();
	addModalProps.length = 0;
});

const website = { name: 'website', host: 'website.github.com', hostname: 'github.com' };

function addButton() {
	return screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
}

describe('ConfigSSHKeysIndex', () => {
	it('holds Add until the key list first arrives, so the form can check for duplicates', () => {
		listQuery.current = { data: undefined, isLoading: true };
		const { rerender } = render(<ConfigSSHKeysIndex />);
		expect(addButton().disabled).toBe(true);

		listQuery.current = { data: [website], isLoading: false };
		rerender(<ConfigSSHKeysIndex />);
		expect(addButton().disabled).toBe(false);
	});

	it('still offers Add when the key list failed to load', () => {
		listQuery.current = { data: undefined, isLoading: false, isError: true };
		render(<ConfigSSHKeysIndex />);
		expect(addButton().disabled).toBe(false);
	});

	it('hands the listed keys to the Add form', () => {
		const keys = [website];
		listQuery.current = { data: keys, isLoading: false };
		render(<ConfigSSHKeysIndex />);

		fireEvent.click(addButton());

		expect(addModalProps.at(-1)?.existingKeys).toBe(keys);
	});
});
