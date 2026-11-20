/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, patch } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import type { OrganizationHarperVersion } from '@/integrations/api/api.patch';
import { HarperVersionsSetting, isDay, isExpired } from './HarperVersionsSetting';

const PINNED: OrganizationHarperVersion = { name: 'pinned', version: '5.1.29', expiresAt: null };
const LAPSED: OrganizationHarperVersion = {
	name: 'preview',
	version: '5.4.0-rc.1',
	expiresAt: '2020-01-01T00:00:00.000Z',
};

// What GET /Organization/:id answers when a save reads the stored list; a test sets it to model another editor.
let stored: OrganizationHarperVersion[] = [];

beforeEach(() => {
	patch.mockImplementation((_url, body) => Promise.resolve({ data: body }));
	get.mockImplementation(() => Promise.resolve({ data: { id: 'org-1', harperVersions: stored } }));
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderSetting(entries: OrganizationHarperVersion[]) {
	stored = entries;
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

	it('sends an expiry the form did not change back as stored, keeping its time of day', async () => {
		const timed = { name: 'timed', version: '5.3.4', expiresAt: '2026-12-31T18:30:00.000Z' };
		renderSetting([timed]);
		fireEvent.click(screen.getByRole('button', { name: 'Edit 5.3.4' }));
		typeInto('Name', 'renamed');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(patch).toHaveBeenCalledWith('/Admin/Organization/org-1', {
			harperVersions: [{ ...timed, name: 'renamed' }],
		});
	});

	it('keeps an unreadable expiry as stored unless it is changed, and lets it be cleared to none in one save', async () => {
		const garbled = { name: 'garbled', version: '5.3.5', expiresAt: 'soon' };
		const today = new Date().toISOString().slice(0, 10);
		renderSetting([garbled]);
		fireEvent.click(screen.getByRole('button', { name: 'Edit 5.3.5' }));
		expect((screen.getByLabelText(/^Expires/) as HTMLInputElement).value).toBe(today);
		expect(screen.getByText(/stored expiry could not be read and counts as expired/)).toBeTruthy();
		typeInto('Name', 'renamed');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(patch).toHaveBeenLastCalledWith('/Admin/Organization/org-1', {
			harperVersions: [{ ...garbled, name: 'renamed' }],
		});
		cleanup();

		renderSetting([garbled]);
		fireEvent.click(screen.getByRole('button', { name: 'Edit 5.3.5' }));
		typeInto(/^Expires/, '');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(patch).toHaveBeenLastCalledWith('/Admin/Organization/org-1', {
			harperVersions: [{ ...garbled, expiresAt: null }],
		});
	});

	it('refuses to save an entry someone removed since the form opened, checking the stored list', async () => {
		renderSetting([PINNED, LAPSED]);
		fireEvent.click(screen.getByRole('button', { name: 'Edit 5.1.29' }));
		stored = [LAPSED];
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(patch).not.toHaveBeenCalled();
		expect(screen.getByText('No longer offered; someone removed it since this form opened')).toBeTruthy();
	});

	it("builds a save from the stored list, keeping another staff member's change the page has not polled yet", async () => {
		const added = { name: 'theirs', version: '5.2.0', expiresAt: null };
		renderSetting([PINNED, LAPSED]);
		stored = [PINNED, LAPSED, added];
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Remove 5.4.0-rc.1' }));
		});
		expect(patch).toHaveBeenCalledWith('/Admin/Organization/org-1', { harperVersions: [PINNED, added] });
	});

	it('keeps an open form: removing and editing other entries waits until it is saved or cancelled', () => {
		renderSetting([PINNED, LAPSED]);
		fireEvent.click(screen.getByRole('button', { name: 'Edit 5.4.0-rc.1' }));
		for (const name of ['Remove 5.1.29', 'Edit 5.1.29']) {
			expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
		}
	});

	it('sends nothing when the version was already removed by someone else', async () => {
		renderSetting([PINNED, LAPSED]);
		stored = [LAPSED];
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Remove 5.1.29' }));
		});
		expect(patch).not.toHaveBeenCalled();
	});

	it('shows a refusal from central manager on the form', async () => {
		patch.mockRejectedValueOnce(Object.assign(new Error('Request failed'), {
			isAxiosError: true,
			response: { status: 400, data: { error: 'harperVersions[0].version must be a semver version' } },
		}));
		renderSetting([]);
		fireEvent.click(screen.getByRole('button', { name: 'Offer a version' }));
		typeInto('Version', '5.3.4');
		typeInto('Name', 'preview');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(screen.getByRole('alert').textContent).not.toBe('');
		expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
	});

	it('saves nothing when the read does not return the list, rather than wiping it', async () => {
		get.mockResolvedValueOnce({ data: { id: 'org-1' } });
		renderSetting([PINNED]);
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Remove 5.1.29' }));
		});
		expect(patch).not.toHaveBeenCalled();
	});

	it('saves nothing when the stored list cannot be read', async () => {
		get.mockRejectedValueOnce(new Error('offline'));
		renderSetting([PINNED]);
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Remove 5.1.29' }));
		});
		expect(patch).not.toHaveBeenCalled();
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

	it('removes a version', async () => {
		renderSetting([PINNED, LAPSED]);
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Remove 5.1.29' }));
		});
		expect(patch).toHaveBeenCalledWith('/Admin/Organization/org-1', { harperVersions: [LAPSED] });
	});

	it('refuses growing a list past 25, but lets a list already over it change in place', async () => {
		const many = Array.from(
			{ length: 26 },
			(_, index) => ({ name: `v${index}`, version: `5.1.${index}`, expiresAt: null }),
		);
		renderSetting(many);
		fireEvent.click(screen.getByRole('button', { name: 'Edit 5.1.0' }));
		typeInto('Name', 'renamed');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(patch).toHaveBeenCalledTimes(1);
		cleanup();

		renderSetting(many.slice(0, 25));
		fireEvent.click(screen.getByRole('button', { name: 'Offer a version' }));
		typeInto('Version', '5.9.0');
		typeInto('Name', 'one more');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});
		expect(patch).toHaveBeenCalledTimes(1);
		expect(screen.getByText('An organization can be offered at most 25 versions')).toBeTruthy();
	});

	it('takes only a day that exists as an expiry', () => {
		expect(isDay('2026-02-28')).toBe(true);
		for (const day of ['2026-02-31', '2026-13-01', '26-01-01', '20261-01-01']) { expect(isDay(day)).toBe(false); }
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
