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
	source: 'comp',
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

async function mount(grant: AdminClusterGrant | null) {
	const result = render(
		<TestProvider>
			<GrantCreatedModal grant={grant} onOpenChange={() => {}} />
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
		await mount(GRANT);
		expect(screen.getByTestId('created-grant-id').textContent).toBe('grt-abc123');
		fireEvent.click(screen.getByLabelText('Copy grant id'));
		expect(copy).toHaveBeenCalledWith('grt-abc123');
	});

	// Unbound and bound grants behave differently enough that the confirmation says which it is.
	it('says an unbound grant is waiting to be claimed', async () => {
		await mount(GRANT);
		expect(screen.getByText(/Held unbound until this organization creates a cluster/)).toBeTruthy();
		cleanup();
		await mount({ ...GRANT, clusterId: 'clu-9' });
		expect(screen.getByText('Applies now to clu-9.')).toBeTruthy();
	});
});
