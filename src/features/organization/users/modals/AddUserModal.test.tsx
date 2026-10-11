/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, post } }));
vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ organizationId: 'org-1' }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Radix Select can't be driven in jsdom; a native select exercises the same `onValueChange` wiring.
vi.mock('@/components/ui/select', () => ({
	Select: (
		{ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (v: string) => void },
	) => (
		<select aria-label="Roles" value={value} onChange={(event) => onValueChange(event.target.value)}>
			<option value="" />
			{children}
		</select>
	),
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ value }: { value: string }) => <option value={value}>{value}</option>,
	SelectLabel: () => null,
	SelectTrigger: () => null,
	SelectValue: () => null,
}));

import { AddUserModal } from './AddUserModal';

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

async function showInviteNotice() {
	get.mockResolvedValue({ data: [{ id: 'role-1', roleName: 'admin' }] });
	post.mockRejectedValue(
		new AxiosError('Request failed with status code 404', 'ERR_BAD_REQUEST', undefined, undefined, {
			status: 404,
			statusText: 'Not Found',
			headers: {},
			config: { headers: new AxiosHeaders() },
			data: '',
		}),
	);
	const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<AddUserModal isModalOpen onChangesSaved={vi.fn()} setIsModalOpen={vi.fn()} />
		</QueryClientProvider>,
	);
	fireEvent.change(await screen.findByRole('combobox', { name: 'Roles' }), { target: { value: 'role-1' } });
	fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new.person@example.com' } });
	await act(async () => {
		fireEvent.submit(screen.getByRole('button', { name: /Add User/ }).closest('form')!);
	});
	return screen.findByText('This person doesn’t have a Fabric account. Do you want to invite them?');
}

describe('AddUserModal', () => {
	it('offers an invitation when the address has no Fabric account', async () => {
		await showInviteNotice();
		expect(post).toHaveBeenCalledWith('/OrganizationRole/', { email: 'new.person@example.com', roleId: 'role-1' });
		expect(screen.getByRole('button', { name: /Invite User/ })).toBeTruthy();
	});

	it('renders the invitation notice as a readable warning, not white text on solid amber', async () => {
		const notice = (await showInviteNotice()).closest('p')!;
		const classes = notice.className.split(/\s+/);
		expect(classes).toEqual(expect.arrayContaining(['text-foreground', 'bg-amber-500/10', 'border-amber-600']));
		expect(classes).not.toContain('text-white');
		expect(classes).not.toContain('text-muted-foreground');
		expect(classes.some((name) => /^bg-amber-\d+$/.test(name))).toBe(false);
	});
});
