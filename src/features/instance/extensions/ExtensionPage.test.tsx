/**
 * @vitest-environment jsdom
 */
import { checkExtensionAccess } from '@/features/instance/extensions/access';
import type { ExtensionDataSource } from '@/features/instance/extensions/dataSource';
import { ExtensionPage } from '@/features/instance/extensions/ExtensionPage';
import { parseStudioConfiguration } from '@/features/instance/extensions/parseStudioConfiguration';
import type { PlacedExtensionPage } from '@/features/instance/extensions/useStudioExtensions';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	extensionKey: 'harper-vault.vault',
	pages: [] as PlacedExtensionPage[],
	dataSource: {
		id: 'test',
		list: vi.fn(async () => ({ records: [], truncated: false })),
		count: vi.fn(),
		get: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		remove: vi.fn(),
		send: vi.fn(),
	} satisfies ExtensionDataSource,
}));

vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ extensionKey: mocks.extensionKey }) }));
vi.mock('@/features/instance/extensions/useStudioExtensions', () => ({
	useExtensionPages: () => mocks.pages,
	useExtensionDataSource: () => mocks.dataSource,
	useExtensionPermission: () => ({ super_user: true }),
}));

afterEach(() => {
	cleanup();
	mocks.extensionKey = 'harper-vault.vault';
});

const superUser: LocalRolePermission = { super_user: true };

/** A page as the nav would place it: parsed from the cluster's answer, then judged for a super user. */
function renderPage(declaration: Record<string, unknown>) {
	mocks.pages = parseStudioConfiguration({
		pages: [{
			component: 'harper-vault',
			id: 'vault',
			name: 'Vault',
			icon: 'not-a-lucide-icon',
			placement: 'tab',
			content: { kind: 'sections', sections: [{ type: 'text', body: 'Hello' }] },
			...declaration,
		}],
	}).pages.map((page) => ({ ...page, verdict: checkExtensionAccess(superUser, page.access) }));
	render(
		<QueryClientProvider client={new QueryClient()}>
			<ExtensionPage placement="tab" />
		</QueryClientProvider>,
	);
}

describe('ExtensionPage', () => {
	it('draws the sections of a page it can read', () => {
		renderPage({});
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Vault');
		expect(screen.getByText('Hello')).toBeTruthy();
		expect(screen.queryByRole('note')).toBeNull();
	});

	it('keeps a page with content it cannot draw, under its own header, saying it needs a newer Studio', () => {
		renderPage({ content: { kind: 'sections', requires: ['charts'], sections: [{ type: 'text', body: 'Hello' }] } });
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Vault');
		const note = screen.getByRole('note');
		expect(note.textContent).toContain('This page needs a newer version of Studio');
		expect(note.textContent).toContain('It requires "charts"');
		expect(screen.queryByText('Hello')).toBeNull();
	});

	it('says when it could not read a page at all', () => {
		renderPage({ content: { kind: 'sections', sections: 'Hello' } });
		expect(screen.getByRole('note').textContent).toContain("Studio couldn't read this page");
	});

	it('refuses a page whose access it cannot read, even to a super user, and names what it could not read', () => {
		renderPage({ access: { role: 'superuser' } });
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe("Studio can't show Vault");
		expect(screen.getByText("Studio can't read its access.role. It may need a newer Studio.")).toBeTruthy();
		expect(screen.queryByText('Hello')).toBeNull();
	});

	it("doesn't carry one page's unsaved form edits to the next page's record", async () => {
		const formPage = (id: string, table: string) => ({
			component: 'harper-vault',
			id,
			name: id,
			placement: 'tab',
			access: { tables: [{ database: 'vault', table, actions: ['read', 'update'] }] },
			content: {
				kind: 'sections',
				sections: [{
					type: 'form',
					database: 'vault',
					table,
					recordId: 'default',
					fields: [{ attribute: 'origin', label: 'Origin', input: 'text' }],
				}],
			},
		});
		mocks.pages = parseStudioConfiguration({ pages: [formPage('first', 'A'), formPage('second', 'B')] }).pages
			.map((page) => ({ ...page, verdict: checkExtensionAccess(superUser, page.access) }));
		mocks.dataSource.get.mockImplementation(async (_database: string, table: string) => ({
			id: 'default',
			origin: `stored in ${table}`,
		}));
		mocks.extensionKey = 'harper-vault.first';
		const client = new QueryClient();
		const tree = () => (
			<QueryClientProvider client={client}>
				<ExtensionPage placement="tab" />
			</QueryClientProvider>
		);
		const { rerender } = render(tree());
		const origin = await screen.findByDisplayValue('stored in A');
		fireEvent.change(origin, { target: { value: 'edited on the first page' } });

		mocks.extensionKey = 'harper-vault.second';
		rerender(tree());
		expect(await screen.findByDisplayValue('stored in B')).toBeTruthy();
		expect(screen.queryByDisplayValue('edited on the first page')).toBeNull();
		await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true));
	});

	it("refuses a page that lists one of Harper's own operations, saying which, not blaming the role", () => {
		renderPage({ access: { operations: ['sql'] } });
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe("Studio can't show Vault");
		expect(screen.getByText("It lists sql, one of Harper's own operations, which a page can't send.")).toBeTruthy();
		expect(screen.queryByText('Hello')).toBeNull();
	});
});
