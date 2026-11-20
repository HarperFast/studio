/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { patch } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { OrganizationHarperVersion } from '@/integrations/api/api.patch';
import { HarperVersionsSetting, isExpired } from './HarperVersionsSetting';

const PINNED: OrganizationHarperVersion = { name: 'pinned', version: '5.1.29', expiresAt: null };
const LAPSED: OrganizationHarperVersion = {
	name: 'preview',
	version: '5.4.0-rc.1',
	expiresAt: '2020-01-01T00:00:00.000Z',
};

beforeEach(() => {
	patch.mockImplementation((_url, body) => Promise.resolve({ data: body }));
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderSetting(entries: OrganizationHarperVersion[]) {
	const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	client.setQueryData(['org-1'], { id: 'org-1', harperVersions: entries });
	render(
		<QueryClientProvider client={client}>
			<HarperVersionsSetting organizationId="org-1" entries={entries} />
		</QueryClientProvider>,
	);
	return client;
}

const typeInto = (label: string | RegExp, value: string) =>
	fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('HarperVersionsSetting', () => {
	it('lists each offered version, marking one past its expiry', () => {
		renderSetting([PINNED, LAPSED]);
		const list = screen.getByRole('list', { name: 'Harper versions offered to this organization' });
		expect(list.textContent).toContain('5.1.29');
		expect(list.textContent).toContain('No expiry');
		expect(screen.getAllByText('Expired')).toHaveLength(1);
	});

	it('offers a new version with its expiry, sending the whole list', async () => {
		const client = renderSetting([PINNED]);
		fireEvent.click(screen.getByRole('button', { name: 'Offer a version' }));
		typeInto('Version', '5.4.0-beta.3');
		typeInto('Name', ' early access ');
		typeInto(/^Expires/, '2026-12-31');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		const next = [PINNED, { name: 'early access', version: '5.4.0-beta.3', expiresAt: '2026-12-31T00:00:00.000Z' }];
		expect(patch).toHaveBeenCalledWith('/Admin/Organization/org-1', { harperVersions: next });
		expect(client.getQueryData(['org-1'])).toEqual({ id: 'org-1', harperVersions: next });
	});

	it('refuses to offer a version that is already offered, leaving the stored entry alone', async () => {
		renderSetting([PINNED]);
		fireEvent.click(screen.getByRole('button', { name: 'Offer a version' }));
		typeInto('Version', '5.1.29');
		typeInto('Name', 'again');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(patch).not.toHaveBeenCalled();
		expect(screen.getByText('Already offered; edit that entry instead')).toBeTruthy();
	});

	it('sends an expiry the form did not change back as stored, its time of day or an unreadable value included', async () => {
		const timed = { name: 'timed', version: '5.3.4', expiresAt: '2026-12-31T18:30:00.000Z' };
		const unreadable = { name: 'garbled', version: '5.3.5', expiresAt: 'soon' };
		for (const entry of [timed, unreadable]) {
			renderSetting([entry]);
			fireEvent.click(screen.getByRole('button', { name: `Edit ${entry.version}` }));
			typeInto('Name', 'renamed');
			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: 'Save' }));
			});
			expect(patch).toHaveBeenLastCalledWith('/Admin/Organization/org-1', {
				harperVersions: [{ ...entry, name: 'renamed' }],
			});
			cleanup();
		}
	});

	it('refuses to save an entry someone removed since the form opened', async () => {
		const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
		const view = (entries: OrganizationHarperVersion[]) => (
			<QueryClientProvider client={client}>
				<HarperVersionsSetting organizationId="org-1" entries={entries} />
			</QueryClientProvider>
		);
		const { rerender } = render(view([PINNED, LAPSED]));
		fireEvent.click(screen.getByRole('button', { name: 'Edit 5.1.29' }));
		rerender(view([LAPSED]));
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(patch).not.toHaveBeenCalled();
		expect(screen.getByText('No longer offered; someone removed it since this form opened')).toBeTruthy();
	});

	it('says an unreadable expiry is read as expired, rather than showing an invalid date', () => {
		renderSetting([{ ...PINNED, expiresAt: 'soon' }]);
		expect(screen.getByText('Unreadable expiry, read as expired')).toBeTruthy();
		expect(screen.queryByText(/Invalid Date/)).toBeNull();
	});

	it('changes an entry in place, and an empty expiry means none', async () => {
		renderSetting([LAPSED, PINNED]);
		fireEvent.click(screen.getByRole('button', { name: 'Edit 5.4.0-rc.1' }));
		typeInto(/^Expires/, '');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(patch).toHaveBeenCalledWith('/Admin/Organization/org-1', {
			harperVersions: [{ ...LAPSED, expiresAt: null }, PINNED],
		});
	});

	it('opens an entry whose stored expiry does not parse with the expiry empty', () => {
		renderSetting([{ ...PINNED, expiresAt: 'soon' }]);
		fireEvent.click(screen.getByRole('button', { name: 'Edit 5.1.29' }));
		expect((screen.getByLabelText(/^Expires/) as HTMLInputElement).value).toBe('');
	});

	it('removes a version', async () => {
		renderSetting([PINNED, LAPSED]);
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Remove 5.1.29' }));
		});
		expect(patch).toHaveBeenCalledWith('/Admin/Organization/org-1', { harperVersions: [LAPSED] });
	});

	it('refuses the stable label and a version that is not one, without saving', async () => {
		renderSetting([]);
		fireEvent.click(screen.getByRole('button', { name: 'Offer a version' }));
		typeInto('Version', 'latest');
		typeInto('Name', 'Stable');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(patch).not.toHaveBeenCalled();
		expect(screen.getByText('A Harper version, such as 5.3.4')).toBeTruthy();
		expect(screen.getByText('"stable" is the default version\'s label')).toBeTruthy();
	});

	it('reads an expiry that does not parse as expired, as central manager does', () => {
		expect(isExpired({ ...PINNED, expiresAt: 'soon' })).toBe(true);
		expect(isExpired(PINNED)).toBe(false);
	});
});
