/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationPicker } from './OrganizationPicker';

const searches: string[] = [];
const ACME = { id: 'org-1', name: 'Acme' };
const BETA = { id: 'org-2', name: 'Beta' };
vi.mock('@/features/organizations/queries/getAllOrganizations', () => ({
	getAllOrganizationsQueryOptions: (_page: number, term: string) => ({
		queryKey: ['picker-test', term],
		queryFn: async () => {
			searches.push(term);
			if (term === 'bet') { return { organizations: [BETA], hasNextPage: false }; }
			if (term === 'a') { return { organizations: [ACME, BETA], hasNextPage: true }; }
			return { organizations: [ACME, BETA], hasNextPage: false };
		},
		retry: false,
	}),
}));

const settle = (ms = 0) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
// Past the picker's 250 ms debounce, then one more tick for the search result to render.
const pastDebounce = async () => {
	await settle(300);
	await settle();
};

function renderPicker(value = '') {
	const onChange = vi.fn();
	render(
		<QueryClientProvider client={new QueryClient()}>
			<label htmlFor="org">Organization</label>
			<OrganizationPicker id="org" value={value} onChange={onChange} />
		</QueryClientProvider>,
	);
	return { onChange, box: screen.getByLabelText('Organization') };
}

beforeEach(() => {
	searches.length = 0;
});
afterEach(() => cleanup());

describe('OrganizationPicker', () => {
	it('searches the server for what is typed, not the whole table', async () => {
		const { box } = renderPicker();
		fireEvent.change(box, { target: { value: 'bet' } });
		await pastDebounce();
		expect(searches).toContain('bet');
		expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['org-2 (Beta)']);
	});

	it('chooses an org by click and shows its label', async () => {
		const { box, onChange } = renderPicker();
		await settle();
		fireEvent.keyDown(box, { key: 'ArrowDown' });
		fireEvent.click(screen.getByRole('option', { name: 'org-2 (Beta)' }));
		expect(onChange).toHaveBeenCalledWith('org-2');
		expect((box as HTMLInputElement).value).toBe('org-2 (Beta)');
		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it('chooses the highlighted org with Enter, without letting Enter submit the form', async () => {
		const { box, onChange } = renderPicker();
		await settle();
		fireEvent.keyDown(box, { key: 'ArrowDown' });
		fireEvent.keyDown(box, { key: 'ArrowDown' });
		const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		act(() => {
			box.dispatchEvent(enter);
		});
		expect(enter.defaultPrevented).toBe(true);
		expect(onChange).toHaveBeenCalledWith('org-2');
	});

	it('clears the choice once the text is edited, so the box never disagrees with the form', async () => {
		const { box, onChange } = renderPicker('org-1');
		fireEvent.change(box, { target: { value: 'x' } });
		expect(onChange).toHaveBeenCalledWith('');
	});

	it('says when more organizations match than it lists', async () => {
		const { box } = renderPicker();
		fireEvent.change(box, { target: { value: 'a' } });
		await pastDebounce();
		expect(screen.getByText(/keep typing to narrow it down/)).toBeTruthy();
	});
});
