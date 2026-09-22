/**
 * @vitest-environment jsdom
 */
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrantCreatedModal } from './GrantCreatedModal';

const copy = vi.fn();
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyTextToClipboard: () => copy }));

const GRANT = {
	id: 'grt-abc123',
	organizationId: 'org-1',
	clusterId: null,
	source: 'comped',
	status: 'ACTIVE',
	startsAt: '2026-01-01T00:00:00.000Z',
	endsAt: null,
	expiryPolicy: null,
	isActive: true,
} as unknown as AdminClusterGrant;

afterEach(() => {
	cleanup();
	copy.mockClear();
});

async function mount(grants: AdminClusterGrant[] | null) {
	const result = render(
		<TestProvider>
			<GrantCreatedModal grants={grants} onOpenChange={() => {}} />
		</TestProvider>,
	);
	// Radix portals the dialog on mount, so nothing is in the document until effects have run.
	await act(() => null);
	return result;
}

describe('GrantCreatedModal', () => {
	it('shows nothing until there is a grant to report', async () => {
		await mount(null);
		expect(screen.queryByText('Grant created')).toBeNull();
	});

	// The id is the only handle on an unbound grant until a cluster claims it.
	it('shows the id and copies it', async () => {
		await mount([GRANT]);
		expect(screen.getByTestId('created-grant-id').textContent).toBe('grt-abc123');
		fireEvent.click(screen.getByLabelText('Copy grant id'));
		expect(copy).toHaveBeenCalledWith('grt-abc123');
	});

	// Unbound and bound grants behave differently enough that the confirmation says which it is.
	it('says an unbound grant is waiting to be claimed', async () => {
		await mount([GRANT]);
		expect(screen.getByText(/Held unbound until this organization creates a cluster/)).toBeTruthy();
		cleanup();
		await mount([{ ...GRANT, clusterId: 'clu-9' }]);
		expect(screen.getByText('Applies now to clu-9.')).toBeTruthy();
	});

	// A batch shares every term but the id, so the terms show once and every id is copyable.
	it('lists every id of a batch and copies them all at once', async () => {
		const batch = ['grt-1', 'grt-2', 'grt-3'].map((id) => ({ ...GRANT, id }) as AdminClusterGrant);
		await mount(batch);
		expect(screen.getByText('3 grants created')).toBeTruthy();
		expect(screen.getAllByTestId('created-grant-id').map((el) => el.textContent)).toEqual(['grt-1', 'grt-2', 'grt-3']);
		fireEvent.click(screen.getByLabelText('Copy grant id grt-2'));
		expect(copy).toHaveBeenCalledWith('grt-2');
		fireEvent.click(screen.getByRole('button', { name: 'Copy all ids' }));
		expect(copy).toHaveBeenCalledWith('grt-1\ngrt-2\ngrt-3');
		expect(screen.getByText(/each of which claims one/)).toBeTruthy();
	});
});
