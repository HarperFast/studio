/**
 * @vitest-environment jsdom
 */
import { SectionsContent } from '@/features/instance/extensions/content/SectionsContent';
import {
	type ExtensionDataSource,
	type ExtensionRecord,
	PartialWriteError,
	UnconfirmedWriteError,
} from '@/features/instance/extensions/dataSource';
import type {
	ExtensionAccess,
	ExtensionSection,
	ExtensionTableGrant,
	FormSection,
	TableSection,
} from '@/features/instance/extensions/manifest';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import type { ColumnDef } from '@/lib/table';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { focusManager, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const table = vi.hoisted(() => ({ columns: [] as ColumnDef<ExtensionRecord>[] }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() } }));

vi.mock('@/components/SimpleBrowseDataTable', () => ({
	SimpleBrowseDataTable: ({ columns, data, onRowClick, children }: {
		columns: ColumnDef<ExtensionRecord>[];
		data: ExtensionRecord[];
		onRowClick?: (row: { original: ExtensionRecord }) => void;
		children: React.ReactNode;
	}) => {
		table.columns = columns;
		return (
			<div>
				{children}
				{data.map((record) => (
					<div key={String(record.id)}>
						<button type="button" onClick={() => onRowClick?.({ original: record })}>
							row {String(record.id)}
						</button>
						{columns.map((column) => (
							<span key={column.id} data-testid={`${String(record.id)}.${column.id}`}>
								{typeof column.cell === 'function'
									? column.cell({ row: { original: record } } as Parameters<typeof column.cell>[0])
									: null}
							</span>
						))}
					</div>
				))}
			</div>
		);
	},
}));

beforeAll(() => {
	// Radix Select, in the record editor, needs these and jsdom lacks them.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const section: TableSection = {
	type: 'table',
	database: 'redirects',
	table: 'Rule',
	itemName: 'rule',
	columns: [{ attribute: 'source', label: 'Source' }],
	fields: [{ attribute: 'source', label: 'Source', input: 'text', required: true }],
};

const form: FormSection = {
	type: 'form',
	title: 'Settings',
	database: 'redirects',
	table: 'Settings',
	recordId: 'default',
	fields: [{ attribute: 'origin', label: 'Origin', input: 'text' }],
};

const grant = (table: string, ...actions: ExtensionTableGrant['actions']): ExtensionAccess => ({
	tables: [{ database: 'redirects', table, actions }],
});

const ruleAccess = grant('Rule', 'read', 'insert', 'update', 'delete');

function testDataSource(): ExtensionDataSource {
	return {
		id: 'test',
		list: vi.fn(async () => ({ records: [{ id: 'r1', source: '/old', hits: 9 }], truncated: false })),
		count: vi.fn(async () => ({ count: 42, bound: 'exact' as const })),
		get: vi.fn(async () => ({ id: 'default', origin: 'https://a.example' })),
		insert: vi.fn(async () => undefined),
		update: vi.fn(async () => undefined),
		remove: vi.fn(),
		send: vi.fn(async () => undefined),
	};
}

// No retries, so a failed read shows at once. Mutation failures reach the app's global toast, unless they opt out.
const testQueryClient = () =>
	new QueryClient({
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
		defaultOptions: { queries: { retry: false } },
	});

function renderSections(
	sections: ExtensionSection[],
	access?: ExtensionAccess,
	permission: LocalRolePermission = { super_user: true },
	dataSource = testDataSource(),
	queryClient = testQueryClient(),
) {
	render(
		<QueryClientProvider client={queryClient}>
			<SectionsContent sections={sections} dataSource={dataSource} permission={permission} access={access} />
		</QueryClientProvider>,
		// A section that throws is caught by its own boundary; React would log it otherwise.
		{ onCaughtError: () => {} },
	);
	return dataSource;
}

const renderTable = () => renderSections([section], ruleAccess);

function save(source: string) {
	fireEvent.change(screen.getByLabelText(/Source/), { target: { value: source } });
	fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('SectionsContent table', () => {
	it('adds with insert, so a taken key fails instead of overwriting that row', async () => {
		const dataSource = renderTable();
		fireEvent.click(await screen.findByRole('button', { name: /Add rule/i }));
		save('/new');
		await waitFor(() => expect(dataSource.insert).toHaveBeenCalledWith('redirects', 'Rule', { source: '/new' }, 'id'));
		expect(dataSource.update).not.toHaveBeenCalled();
	});

	it("edits with update, writing only the form's fields and the key", async () => {
		const dataSource = renderTable();
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		save('/changed');
		await waitFor(() =>
			expect(dataSource.update).toHaveBeenCalledWith('redirects', 'Rule', { id: 'r1', source: '/changed' }, 'id')
		);
		expect(dataSource.insert).not.toHaveBeenCalled();
	});

	it("names the section's own key to every write, so the answer is checked against it", async () => {
		const dataSource = testDataSource();
		vi.mocked(dataSource.list).mockResolvedValue({
			records: [{ id: 'r1', path: '/p', source: '/old' }],
			truncated: false,
		});
		renderSections([{ ...section, primaryKey: 'path' }], ruleAccess, undefined, dataSource);
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		save('/changed');
		await waitFor(() =>
			expect(dataSource.update).toHaveBeenCalledWith('redirects', 'Rule', { path: '/p', source: '/changed' }, 'path')
		);
		fireEvent.click(await screen.findByRole('button', { name: /Add rule/i }));
		save('/new');
		await waitFor(() =>
			expect(dataSource.insert).toHaveBeenCalledWith('redirects', 'Rule', { source: '/new' }, 'path')
		);
	});

	it('writes only the fields the user changed, not ones the record lacked (read back as null)', async () => {
		const dataSource = testDataSource();
		vi.mocked(dataSource.list).mockResolvedValue({
			records: [{ id: 'r1', source: '/old', note: null }],
			truncated: false,
		});
		renderSections(
			[{
				...section,
				fields: [...(section.fields ?? []), { attribute: 'note', label: 'Note', input: 'text' }],
			}],
			ruleAccess,
			undefined,
			dataSource,
		);
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		save('/changed');
		await waitFor(() =>
			expect(dataSource.update).toHaveBeenCalledWith('redirects', 'Rule', { id: 'r1', source: '/changed' }, 'id')
		);
	});

	it('offers no editor, and says why, when the parser dropped fields it could not draw', async () => {
		renderSections([{
			...section,
			fields: undefined,
			editingUnsupported: { cause: 'newer-studio', reason: 'Its field "colour" uses the input "color".' },
		}], ruleAccess);
		const row = await screen.findByRole('button', { name: 'row r1' });
		expect(screen.getByText('Editing needs a newer Studio').closest('[title]')?.getAttribute('title')).toBe(
			'Its field "colour" uses the input "color".',
		);
		expect(screen.queryByRole('button', { name: /Add rule/i })).toBeNull();
		fireEvent.click(row);
		expect(screen.queryByRole('dialog')).toBeNull();
	});
});

describe('SectionsContent declared reads', () => {
	it('never loads a table its page does not declare, and says so in its place', async () => {
		const dataSource = renderSections([
			{ ...section, title: 'Secrets', table: 'Secret' },
			section,
		], grant('Rule', 'read'));
		await screen.findByRole('button', { name: 'row r1' });
		const note = screen.getByRole('note');
		expect(note.textContent).toContain('Secrets');
		expect(note.textContent).toContain("It reads redirects.Secret, which this page doesn't declare.");
		expect(dataSource.list).toHaveBeenCalledTimes(1);
		expect(dataSource.list).toHaveBeenCalledWith('redirects', 'Rule', 'id', ['id', 'source']);
	});

	it('shows an undeclared count as a dash saying why, and counts the declared one', async () => {
		const dataSource = renderSections([{
			type: 'stats',
			items: [
				{ label: 'Rules', value: { kind: 'count', database: 'redirects', table: 'Rule' } },
				{ label: 'Secrets', value: { kind: 'count', database: 'redirects', table: 'Secret' } },
			],
		}], grant('Rule', 'read'));
		expect(await screen.findByText('42')).toBeTruthy();
		const reason = "It reads redirects.Secret, which this page doesn't declare.";
		expect(screen.getByTitle(reason).textContent).toBe(`—${reason}`);
		expect(dataSource.count).toHaveBeenCalledTimes(1);
		expect(dataSource.count).toHaveBeenCalledWith('redirects', 'Rule', undefined);
	});

	it('never loads the record of a form whose table its page does not declare', async () => {
		const dataSource = renderSections([form, section], grant('Rule', 'read'));
		await screen.findByRole('button', { name: 'row r1' });
		expect(screen.getByRole('note').textContent).toContain(
			"It reads redirects.Settings, which this page doesn't declare.",
		);
		expect(dataSource.get).not.toHaveBeenCalled();
		expect(screen.queryByLabelText('Origin')).toBeNull();
	});

	it('declares nothing for a page with no access at all', async () => {
		const dataSource = renderSections([section]);
		expect(screen.getByRole('note').textContent).toContain('It reads redirects.Rule');
		await Promise.resolve();
		expect(dataSource.list).not.toHaveBeenCalled();
	});
});

describe('SectionsContent declared writes', () => {
	it('offers no editor on a page that declares only reading, even to a super user, and says so', async () => {
		renderSections([section], grant('Rule', 'read'));
		const row = await screen.findByRole('button', { name: 'row r1' });
		expect(screen.getByText('Read-only on this page').closest('[title]')?.getAttribute('title')).toBe(
			"This page doesn't declare insert, update or delete on redirects.Rule.",
		);
		expect(screen.queryByRole('button', { name: /Add rule/i })).toBeNull();
		fireEvent.click(row);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('offers each of Add, Save and Delete only for the action its page declares', async () => {
		renderSections([section], grant('Rule', 'read', 'insert'));
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(screen.getByRole('button', { name: /Add rule/i })).toBeTruthy();
		cleanup();

		renderSections([section], grant('Rule', 'read', 'update'));
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
		expect(screen.queryByRole('button', { name: /Add rule/i })).toBeNull();
		cleanup();

		renderSections([section], grant('Rule', 'read', 'delete'));
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
	});

	it("still needs the viewer's role to grant a declared write", async () => {
		const reader: LocalRolePermission = {
			super_user: false,
			redirects: {
				tables: { Rule: { read: true, insert: false, update: false, delete: false, attribute_permissions: [] } },
			},
		};
		renderSections([section], ruleAccess, reader);
		await screen.findByRole('button', { name: 'row r1' });
		expect(screen.getByText('Read-only for your role')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Add rule/i })).toBeNull();
	});

	it('saves a form only when its page declares the update', async () => {
		renderSections([form], grant('Settings', 'read'));
		const origin = await screen.findByDisplayValue('https://a.example');
		expect((origin as HTMLInputElement).disabled).toBe(true);
		expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
		cleanup();

		const dataSource = renderSections([form], grant('Settings', 'read', 'update'));
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() =>
			expect(dataSource.update).toHaveBeenCalledWith('redirects', 'Settings', {
				id: 'default',
				origin: 'https://b.example',
			}, 'id')
		);
	});
});

describe('SectionsContent action confirmation', () => {
	const access: ExtensionAccess = { ...ruleAccess, operations: ['cache_flush'] };
	const disable = {
		label: 'Disable all',
		request: { operation: 'update', database: 'redirects', table: 'Rule', records: [{ id: 'r1', enabled: false }] },
	};

	it('asks before a table write it was not told to confirm, showing the request it will send', async () => {
		const dataSource = renderSections([{ type: 'actions', actions: [disable] }], access);
		fireEvent.click(screen.getByRole('button', { name: 'Disable all' }));
		const dialog = await screen.findByRole('alertdialog');
		expect(dialog.textContent).toContain('Studio will send update to redirects.Rule:');
		expect(screen.getByLabelText('Request').textContent).toBe(JSON.stringify(disable.request, null, 2));
		expect(dataSource.send).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole('button', { name: 'Disable all' }));
		await waitFor(() => expect(dataSource.send).toHaveBeenCalledWith(disable.request));
	});

	it("shows the request beneath the author's own confirmation text", async () => {
		renderSections([{
			type: 'actions',
			actions: [{
				label: 'Flush',
				confirm: 'Every request misses until the cache warms up again.',
				request: { operation: 'cache_flush', scope: 'all' },
			}],
		}], access);
		fireEvent.click(screen.getByRole('button', { name: 'Flush' }));
		const dialog = await screen.findByRole('alertdialog');
		const text = dialog.textContent ?? '';
		expect(text.indexOf('Every request misses')).toBeLessThan(
			text.indexOf('Studio will send the cache_flush operation:'),
		);
		expect(screen.getByLabelText('Request').textContent).toContain('"scope": "all"');
	});

	it('asks before a destructive action even without author text, and runs a plain one at once', async () => {
		const dataSource = renderSections([{
			type: 'actions',
			actions: [
				{ label: 'Purge', variant: 'destructive', request: { operation: 'cache_flush' } },
				{ label: 'Refresh', request: { operation: 'cache_flush' } },
			],
		}], access);
		fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		await waitFor(() => expect(dataSource.send).toHaveBeenCalledTimes(1));
		expect(screen.queryByRole('alertdialog')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Purge' }));
		expect((await screen.findByRole('alertdialog')).textContent).toContain(
			'Studio will send the cache_flush operation:',
		);
	});

	it("never offers, or sends, one of Harper's own operations", () => {
		const dataSource = renderSections([{
			type: 'actions',
			actions: [{ label: 'Describe', request: { operation: 'describe_all' } }],
		}], { operations: ['describe_all'] });
		const button = screen.getByRole('button', { name: 'Describe' }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		expect(screen.getByText("Describe_all is one of Harper's own operations, which a page can't send.").id)
			.toBe(button.getAttribute('aria-describedby'));
		fireEvent.click(button);
		expect(dataSource.send).not.toHaveBeenCalled();
	});

	it("doesn't offer an action needing an optional grant the viewer's role lacks", () => {
		const optional: ExtensionAccess = {
			tables: [{ database: 'redirects', table: 'Rule', actions: ['read'] }],
			optional: { tables: [{ database: 'redirects', table: 'Rule', actions: ['update'] }] },
		};
		const reader: LocalRolePermission = {
			super_user: false,
			redirects: {
				tables: {
					Rule: { read: true, insert: false, update: false, delete: false, attribute_permissions: [] },
				},
			},
		};
		const dataSource = renderSections([{ type: 'actions', actions: [disable] }], optional, reader);
		const button = screen.getByRole('button', { name: 'Disable all' }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		expect(screen.getByText('Your role cannot update redirects.Rule.')).toBeTruthy();
		fireEvent.click(button);
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(dataSource.send).not.toHaveBeenCalled();
		cleanup();
		renderSections([{ type: 'actions', actions: [disable] }], optional);
		expect((screen.getByRole('button', { name: 'Disable all' }) as HTMLButtonElement).disabled).toBe(false);
	});

	it('warns that a table write Harper applied to only some records partly took effect, and reads the page again', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const dataSource = testDataSource();
		const partly = 'Harper updated 1 of 2 records. A record is skipped when nothing is stored under its primary key.';
		vi.mocked(dataSource.send).mockRejectedValue(new PartialWriteError(partly));
		renderSections([section, { type: 'actions', actions: [disable] }], access, undefined, dataSource);
		await screen.findByRole('button', { name: 'row r1' });
		fireEvent.click(screen.getByRole('button', { name: 'Disable all' }));
		fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Disable all' }));
		await waitFor(() =>
			expect(toast.warning).toHaveBeenCalledWith('Disable all only partly took effect', { description: partly })
		);
		await waitFor(() => expect(dataSource.list).toHaveBeenCalledTimes(2));
		expect(toast.success).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
		logged.mockRestore();
	});
});

describe('SectionsContent placeholders', () => {
	it('draws a placeholder section as a note in its place, saying why', () => {
		renderSections([
			{ type: 'text', body: 'Before' },
			{ type: 'unsupported', title: 'Traffic', cause: 'newer-studio', reason: 'Its type "chart" is newer.' },
			{ type: 'unsupported', cause: 'unreadable', reason: 'It has no body.' },
		]);
		const [newer, unreadable] = screen.getAllByRole('note');
		expect(newer.textContent).toContain('Traffic');
		expect(newer.textContent).toContain('This section needs a newer version of Studio');
		expect(newer.textContent).toContain('Its type "chart" is newer.');
		expect(unreadable.textContent).toContain("Studio couldn't read this section");
		expect(unreadable.textContent).toContain('It has no body.');
		expect(screen.getByText('Before')).toBeTruthy();
	});

	it('draws a stat it cannot show as a dash, keeping its label and saying why', () => {
		const dataSource = renderSections([{
			type: 'stats',
			items: [{ label: 'P95', value: { kind: 'unsupported', cause: 'newer-studio', reason: 'Its kind is newer.' } }],
		}]);
		expect(screen.getByText('P95')).toBeTruthy();
		const dash = screen.getByTitle('Its kind is newer.');
		expect(dash.textContent).toBe('—Its kind is newer.');
		expect(dataSource.count).not.toHaveBeenCalled();
	});

	it('draws an action this Studio cannot run as disabled, with the reason written beside it', () => {
		const access: ExtensionAccess = { operations: ['export_rules', 'prerender_refresh'] };
		const dataSource = renderSections([{
			type: 'actions',
			actions: [
				{
					label: 'Export',
					request: { operation: 'export_rules' },
					unsupported: { cause: 'newer-studio', reason: 'It requires "downloads".' },
				},
				{ label: 'Refresh', request: { operation: 'prerender_refresh' } },
			],
		}], access);
		const exportButton = screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement;
		expect(exportButton.disabled).toBe(true);
		expect(screen.getByText('It requires "downloads".').id).toBe(exportButton.getAttribute('aria-describedby'));
		fireEvent.click(exportButton);
		expect(dataSource.send).not.toHaveBeenCalled();
		const refresh = screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement;
		expect(refresh.disabled).toBe(false);
		expect(refresh.getAttribute('aria-describedby')).toBeNull();
	});
});

/** What Harper stores and returns for `{"toString": null}`, which `String()` throws on. */
const unprintable = (): unknown => JSON.parse('{"toString":null}');

function listing(...records: ExtensionRecord[]) {
	const dataSource = testDataSource();
	vi.mocked(dataSource.list).mockResolvedValue({ records, truncated: false });
	return dataSource;
}

/** What the data table searches and sorts the first column by. */
const firstAccessor = () =>
	(table.columns[0] as unknown as { accessorFn: (record: ExtensionRecord) => unknown }).accessorFn;

describe('SectionsContent stored values', () => {
	it('draws a value String() throws on in every format, and leaves it searchable', async () => {
		const formats = ['text', 'code', 'badge', 'number', 'datetime'] as const;
		const dataSource = listing({ id: 'r1', ...Object.fromEntries(formats.map((format) => [format, unprintable()])) });
		renderSections(
			[{
				...section,
				columns: formats.map((format) => ({ attribute: format, label: format, format })),
			}],
			ruleAccess,
			undefined,
			dataSource,
		);
		await screen.findByRole('button', { name: 'row r1' });
		for (const format of formats) {
			expect(screen.getByTestId(`r1.${format}`).textContent).toBe('{"toString":null}');
		}
		// The table's search calls String() on what the accessor returns.
		expect(String(firstAccessor()({ id: 'r1', text: unprintable() }))).toBe('{"toString":null}');
	});

	it('never reads an attribute a record lacks from Object.prototype', async () => {
		const dataSource = listing({ id: 'r1' });
		renderSections(
			[{ ...section, columns: [{ attribute: 'constructor', label: 'Maker' }] }],
			ruleAccess,
			undefined,
			dataSource,
		);
		expect((await screen.findByTestId('r1.constructor')).textContent).toBe('—');
		expect(firstAccessor()({ id: 'r1' })).toBeUndefined();
	});

	it("colours a badge only from its own variants, so a value named like Object's members is plain", async () => {
		const dataSource = listing({ id: 'r1', status: 'constructor' }, { id: 'r2', status: 'fresh' });
		renderSections(
			[{ ...section, columns: [{ attribute: 'status', label: 'Status', format: 'badge' }] }],
			ruleAccess,
			undefined,
			dataSource,
		);
		expect((await screen.findByTestId('r1.status')).firstElementChild?.className).toContain('bg-secondary/40');
		expect(screen.getByTestId('r2.status').firstElementChild?.className).toContain('bg-green/40');
	});

	it('writes out a datetime that is not a date as it is stored', async () => {
		const dataSource = listing({ id: 'r1', at: 'last tuesday' }, { id: 'r2', at: 0 });
		renderSections(
			[{ ...section, columns: [{ attribute: 'at', label: 'At', format: 'datetime' }] }],
			ruleAccess,
			undefined,
			dataSource,
		);
		expect((await screen.findByTestId('r1.at')).textContent).toBe('last tuesday');
		expect(screen.getByTestId('r2.at').textContent).toBe(new Date(0).toLocaleString());
	});

	it('edits a record whose values String() throws on, and names it when deleting', async () => {
		const dataSource = listing({ id: 'r1', source: unprintable(), code: unprintable() });
		renderSections(
			[{
				...section,
				fields: [
					{ attribute: 'source', label: 'Source', input: 'text' },
					{ attribute: 'code', label: 'Code', input: 'select', options: [{ value: 301, label: 'Moved' }] },
				],
			}],
			ruleAccess,
			undefined,
			dataSource,
		);
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		expect((screen.getByLabelText('Source') as HTMLInputElement).value).toBe('{"toString":null}');
		expect(screen.getByRole('combobox')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		expect(await screen.findByText('{"toString":null}', { selector: 'span.font-semibold' })).toBeTruthy();
	});

	it("treats a field named like Object's members as empty until it is filled in", async () => {
		const dataSource = renderSections([{
			...section,
			fields: [{ attribute: 'constructor', label: 'Maker', input: 'text', required: true }],
		}], ruleAccess);
		fireEvent.click(await screen.findByRole('button', { name: /Add rule/i }));
		expect((screen.getByLabelText(/Maker/) as HTMLInputElement).value).toBe('');
		fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);
		expect(await screen.findByText('Maker is required.')).toBeTruthy();
		expect(dataSource.insert).not.toHaveBeenCalled();
	});
});

describe('SectionsContent section failures', () => {
	it('draws a section that fails to render as a note in its place, and its siblings as usual', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		renderSections([
			{ type: 'text', body: 'Before' },
			{ type: 'text', title: 'Broken', body: 42 as unknown as string },
			section,
		], ruleAccess);
		const note = screen.getByRole('note');
		expect(note.textContent).toContain('Broken');
		expect(note.textContent).toContain("This section couldn't be shown");
		expect(screen.getByText('Before')).toBeTruthy();
		expect(await screen.findByRole('button', { name: 'row r1' })).toBeTruthy();
		// The root onCaughtError reports it to RUM; console.error would count it twice.
		expect(warn).toHaveBeenCalledWith('[extension section] render failed', expect.any(TypeError));
		warn.mockRestore();
	});

	it("tries a section again once the page's configuration changes", () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const queryClient = testQueryClient();
		const draw = (sections: ExtensionSection[]) => (
			<QueryClientProvider client={queryClient}>
				<SectionsContent sections={sections} dataSource={testDataSource()} permission={undefined} access={undefined} />
			</QueryClientProvider>
		);
		const { rerender } = render(draw([{ type: 'text', body: 42 as unknown as string }]), { onCaughtError: () => {} });
		expect(screen.getByText("This section couldn't be shown")).toBeTruthy();
		rerender(draw([{ type: 'text', body: 'Fixed' }]));
		expect(screen.getByText('Fixed')).toBeTruthy();
		warn.mockRestore();
	});
});

describe('SectionsContent failed reads', () => {
	const restarting = new Error('Harper is restarting');

	it('shows rows that failed to load as an error with Retry, never as an empty table', async () => {
		const dataSource = testDataSource();
		vi.mocked(dataSource.list).mockRejectedValueOnce(restarting);
		renderSections([section], ruleAccess, undefined, dataSource);
		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain("Studio couldn't load redirects.Rule");
		expect(alert.textContent).toContain('Harper is restarting');
		expect(screen.queryByRole('button', { name: /Refresh/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /Add rule/i })).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(await screen.findByRole('button', { name: 'row r1' })).toBeTruthy();
		expect(screen.queryByRole('alert')).toBeNull();
		expect(dataSource.list).toHaveBeenCalledTimes(2);
	});

	it('shows a record that failed to load as an error with Retry, with nothing to edit or save', async () => {
		const dataSource = testDataSource();
		vi.mocked(dataSource.get).mockRejectedValueOnce(restarting);
		renderSections([form], grant('Settings', 'read', 'update'), undefined, dataSource);
		expect((await screen.findByRole('alert')).textContent).toContain("Studio couldn't load redirects.Settings");
		expect(screen.queryByLabelText('Origin')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(await screen.findByDisplayValue('https://a.example')).toBeTruthy();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('keeps Save disabled while a later read of the record fails', async () => {
		const dataSource = testDataSource();
		const queryClient = testQueryClient();
		renderSections([form], grant('Settings', 'read', 'update'), undefined, dataSource, queryClient);
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false);
		vi.mocked(dataSource.get).mockRejectedValueOnce(restarting);
		await queryClient.refetchQueries();
		expect(await screen.findByRole('alert')).toBeTruthy();
		const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
		expect(save.disabled).toBe(true);
		fireEvent.submit(save.closest('form')!);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(dataSource.update).not.toHaveBeenCalled();
	});
});

describe('SectionsContent table reads', () => {
	it('reads only the key and the attributes its columns and fields use, and keys the rows by them', async () => {
		const dataSource = testDataSource();
		const queryClient = testQueryClient();
		renderSections(
			[{
				...section,
				primaryKey: 'path',
				columns: [{ attribute: 'path', label: 'Path' }, { attribute: 'status', label: 'Status' }],
				fields: [
					{ attribute: 'status', label: 'Status', input: 'text' },
					{ attribute: 'target', label: 'Target', input: 'url' },
				],
			}],
			ruleAccess,
			undefined,
			dataSource,
			queryClient,
		);
		await waitFor(() =>
			expect(dataSource.list).toHaveBeenCalledWith('redirects', 'Rule', 'path', ['path', 'status', 'target'])
		);
		expect(queryClient.getQueryCache().getAll().map((query) => query.queryKey)).toContainEqual(
			['test', 'extension-table', 'redirects', 'Rule', 'rows', 'path', ['path', 'status', 'target']],
		);
	});

	it('does not read the rows again when the window regains focus soon after', async () => {
		const dataSource = renderTable();
		await screen.findByRole('button', { name: 'row r1' });
		try {
			focusManager.setFocused(false);
			focusManager.setFocused(true);
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(dataSource.list).toHaveBeenCalledTimes(1);
		} finally {
			focusManager.setFocused(undefined);
		}
	});
});

describe('SectionsContent primary keys', () => {
	const keyed: TableSection = {
		...section,
		fields: [{ attribute: 'id', label: 'Key', input: 'text' }, ...(section.fields ?? [])],
	};

	it("shows an existing record's key but won't edit it, since a save never changes it", async () => {
		renderSections([keyed], ruleAccess);
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		const key = screen.getByLabelText('Key') as HTMLInputElement;
		expect(key.value).toBe('r1');
		expect(key.disabled).toBe(true);
		expect((screen.getByLabelText(/Source/) as HTMLInputElement).disabled).toBe(false);
	});

	it('lets Add set the key of a new record', async () => {
		const dataSource = renderSections([keyed], ruleAccess);
		fireEvent.click(await screen.findByRole('button', { name: /Add rule/i }));
		const key = screen.getByLabelText('Key') as HTMLInputElement;
		expect(key.disabled).toBe(false);
		fireEvent.change(key, { target: { value: 'r2' } });
		save('/new');
		await waitFor(() =>
			expect(dataSource.insert).toHaveBeenCalledWith('redirects', 'Rule', { id: 'r2', source: '/new' }, 'id')
		);
	});

	it("shows a form's key but won't edit it, since the form always saves its own record", async () => {
		renderSections(
			[{ ...form, fields: [{ attribute: 'id', label: 'Key', input: 'text' }, ...form.fields] }],
			grant('Settings', 'read', 'update'),
		);
		const key = await screen.findByDisplayValue('default') as HTMLInputElement;
		expect(key.disabled).toBe(true);
		expect((screen.getByLabelText('Origin') as HTMLInputElement).disabled).toBe(false);
	});

	it("names a form's own key to its save, whether it updates the record or creates it", async () => {
		const dataSource = testDataSource();
		vi.mocked(dataSource.get).mockResolvedValue({ slug: 'default', origin: 'https://a.example' });
		renderSections(
			[{ ...form, primaryKey: 'slug' }],
			grant('Settings', 'read', 'insert', 'update'),
			undefined,
			dataSource,
		);
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() =>
			expect(dataSource.update).toHaveBeenCalledWith(
				'redirects',
				'Settings',
				{ slug: 'default', origin: 'https://b.example' },
				'slug',
			)
		);
		cleanup();

		vi.mocked(dataSource.get).mockResolvedValue(undefined);
		renderSections(
			[{ ...form, primaryKey: 'slug' }],
			grant('Settings', 'read', 'insert', 'update'),
			undefined,
			dataSource,
		);
		// The field is drawn, disabled, while the read is out; one typed into then would be reset by it.
		await waitFor(() => expect((screen.getByLabelText('Origin') as HTMLInputElement).disabled).toBe(false));
		fireEvent.change(screen.getByLabelText('Origin'), { target: { value: 'https://c.example' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() =>
			expect(dataSource.insert).toHaveBeenCalledWith(
				'redirects',
				'Settings',
				{ slug: 'default', origin: 'https://c.example' },
				'slug',
			)
		);
	});
});

function requestConfig(operation: string) {
	return {
		method: 'post',
		data: JSON.stringify({ operation }),
		headers: new AxiosHeaders(),
	} as InternalAxiosRequestConfig;
}

/** A write that got no answer: the connection dropped after it went out, so it may have landed. */
function unanswered(operation: string) {
	return new AxiosError('Network Error', AxiosError.ERR_NETWORK, requestConfig(operation));
}

/** A write Harper answered by refusing it. */
function refused(operation: string, error: string) {
	const config = requestConfig(operation);
	return new AxiosError('Request failed with status code 400', AxiosError.ERR_BAD_REQUEST, config, undefined, {
		status: 400,
		statusText: '',
		headers: {},
		config,
		data: { error },
	});
}

describe('SectionsContent writes without an answer', () => {
	const silenced = () => vi.spyOn(console, 'error').mockImplementation(() => {});

	/**
	 * A failed delete closes its confirmation, or its re-armed Delete button invites the retry the message
	 * warns against, and says so once: no global toast beside it, and one RUM report.
	 */
	const expectDeleteSettled = async (logged: ReturnType<typeof silenced>) => {
		await waitFor(() => expect(screen.queryByText('Are you sure you want to delete this rule?')).toBeNull());
		expect(toast.error).not.toHaveBeenCalled();
		expect(logged).toHaveBeenCalledTimes(1);
	};

	it("says Studio couldn't confirm an edit, reads the rows again, and still reports the failure", async () => {
		const logged = silenced();
		const failure = unanswered('update');
		const dataSource = testDataSource();
		vi.mocked(dataSource.update).mockRejectedValue(failure);
		renderSections([section], ruleAccess, undefined, dataSource);
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		save('/changed');
		expect(
			await screen.findByText(
				"Studio couldn't confirm whether the rule was saved. Check the table before you try again.",
			),
		).toBeTruthy();
		await waitFor(() => expect(dataSource.list).toHaveBeenCalledTimes(2));
		// Shown inline only, so no global toast says the same thing again; console.error is its RUM report.
		expect(toast.error).not.toHaveBeenCalled();
		expect(logged).toHaveBeenCalledWith(failure);
		logged.mockRestore();
	});

	it("says Studio couldn't confirm an add", async () => {
		const logged = silenced();
		const dataSource = testDataSource();
		vi.mocked(dataSource.insert).mockRejectedValue(unanswered('insert'));
		renderSections([section], ruleAccess, undefined, dataSource);
		fireEvent.click(await screen.findByRole('button', { name: /Add rule/i }));
		save('/new');
		expect(
			await screen.findByText(
				"Studio couldn't confirm whether the rule was added. Check the table before you try again.",
			),
		).toBeTruthy();
		await waitFor(() => expect(dataSource.list).toHaveBeenCalledTimes(2));
		logged.mockRestore();
	});

	it("keeps a refusal Harper answered a plain failure, and doesn't read the rows again", async () => {
		const logged = silenced();
		const dataSource = testDataSource();
		vi.mocked(dataSource.update).mockRejectedValue(refused('update', "unknown attribute 'colour'"));
		renderSections([section], ruleAccess, undefined, dataSource);
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		save('/changed');
		expect(await screen.findByText("unknown attribute 'colour'")).toBeTruthy();
		expect(screen.queryByText(/couldn't confirm/)).toBeNull();
		expect(dataSource.list).toHaveBeenCalledTimes(1);
		expect(toast.error).not.toHaveBeenCalled();
		logged.mockRestore();
	});

	it.each([
		['got no answer', unanswered('delete')],
		["got an answer that doesn't say", new UnconfirmedWriteError('no deleted_hashes')],
	])("says Studio couldn't confirm a delete that %s, and reads the rows again", async (_case, failure) => {
		const logged = silenced();
		const dataSource = testDataSource();
		vi.mocked(dataSource.remove).mockRejectedValue(failure);
		renderSections([section], ruleAccess, undefined, dataSource);
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
		expect(
			await screen.findByText(
				"Studio couldn't confirm whether the rule was deleted. Check the table before you try again.",
			),
		).toBeTruthy();
		await waitFor(() => expect(dataSource.list).toHaveBeenCalledTimes(2));
		await expectDeleteSettled(logged);
		logged.mockRestore();
	});

	it('toasts a save that fails after its dialog closed, which no one would see inline', async () => {
		const logged = silenced();
		const dataSource = testDataSource();
		let fail: (error: unknown) => void = () => {};
		vi.mocked(dataSource.update).mockReturnValue(new Promise((_resolve, reject) => (fail = reject)));
		renderSections([section], ruleAccess, undefined, dataSource);
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		save('/changed');
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		fail(unanswered('update'));
		await waitFor(() =>
			expect(toast.warning).toHaveBeenCalledWith(
				"Studio couldn't confirm whether the rule was saved. Check the table before you try again.",
			)
		);
		vi.mocked(toast.warning).mockClear();

		fireEvent.click(screen.getByRole('button', { name: 'row r1' }));
		vi.mocked(dataSource.update).mockReturnValue(new Promise((_resolve, reject) => (fail = reject)));
		save('/again');
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		fail(refused('update', "unknown attribute 'colour'"));
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith("The rule wasn't saved", {
				description: "unknown attribute 'colour'",
			})
		);
		expect(toast.warning).not.toHaveBeenCalled();
		logged.mockRestore();
	});

	it('keeps a delete Harper skipped a plain failure', async () => {
		const logged = silenced();
		const dataSource = testDataSource();
		vi.mocked(dataSource.remove).mockRejectedValue(
			new Error('Harper skipped it: nothing is stored under that key any more.'),
		);
		renderSections([section], ruleAccess, undefined, dataSource);
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
		expect(await screen.findByText('Harper skipped it: nothing is stored under that key any more.')).toBeTruthy();
		expect(dataSource.list).toHaveBeenCalledTimes(1);
		await expectDeleteSettled(logged);
		logged.mockRestore();
	});

	it("says Studio couldn't confirm a form's save, and reads the record again", async () => {
		const logged = silenced();
		const dataSource = testDataSource();
		vi.mocked(dataSource.update).mockRejectedValue(unanswered('update'));
		renderSections([form], grant('Settings', 'read', 'update'), undefined, dataSource);
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(
			await screen.findByText(
				"Studio couldn't confirm whether your changes were saved. Check the record before you save again.",
			),
		).toBeTruthy();
		await waitFor(() => expect(dataSource.get).toHaveBeenCalledTimes(2));
		// The record read back without the edit, so the edit and the warning both stay.
		expect((screen.getByLabelText('Origin') as HTMLInputElement).value).toBe('https://b.example');
		expect(screen.getByText(/couldn't confirm whether your changes were saved/)).toBeTruthy();
		expect(toast.error).not.toHaveBeenCalled();
		expect(logged).toHaveBeenCalledTimes(1);
		logged.mockRestore();
	});

	it("keeps a form's save Harper refused a plain failure, shown once beside the form", async () => {
		const logged = silenced();
		const dataSource = testDataSource();
		vi.mocked(dataSource.update).mockRejectedValue(refused('update', "unknown attribute 'origin'"));
		renderSections([form], grant('Settings', 'read', 'update'), undefined, dataSource);
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(await screen.findByText("unknown attribute 'origin'")).toBeTruthy();
		expect(screen.queryByText(/couldn't confirm/)).toBeNull();
		expect(dataSource.get).toHaveBeenCalledTimes(1);
		expect(toast.error).not.toHaveBeenCalled();
		expect(logged).toHaveBeenCalledTimes(1);
		logged.mockRestore();
	});

	it("toasts a form's save that settles after the form is gone, which no one would see inline", async () => {
		const logged = silenced();
		const dataSource = testDataSource();
		let fail: (error: unknown) => void = () => {};
		vi.mocked(dataSource.update).mockReturnValue(new Promise((_resolve, reject) => (fail = reject)));
		renderSections([form], grant('Settings', 'read', 'update'), undefined, dataSource);
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(dataSource.update).toHaveBeenCalled());
		cleanup();
		fail(unanswered('update'));
		await waitFor(() =>
			expect(toast.warning).toHaveBeenCalledWith(
				"Studio couldn't confirm whether your changes were saved. Check the record before you save again.",
			)
		);
		logged.mockRestore();
	});

	it("settles a form's save Studio couldn't confirm once the record reads back holding it", async () => {
		const logged = silenced();
		const dataSource = testDataSource();
		vi.mocked(dataSource.update).mockImplementation(async () => {
			vi.mocked(dataSource.get).mockResolvedValue({ id: 'default', origin: 'https://b.example' });
			throw unanswered('update');
		});
		renderSections([form], grant('Settings', 'read', 'update'), undefined, dataSource);
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(dataSource.get).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(screen.queryByText(/couldn't confirm/)).toBeNull());
		expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
		logged.mockRestore();
	});

	const flush = { label: 'Flush cache', request: { operation: 'cache_flush' } };
	const flushAccess: ExtensionAccess = { ...ruleAccess, operations: ['cache_flush'] };

	it("says Studio couldn't confirm an action ran, never that it failed, and reads the page's tables again", async () => {
		const logged = silenced();
		const dataSource = testDataSource();
		vi.mocked(dataSource.send).mockRejectedValue(unanswered('cache_flush'));
		renderSections([section, { type: 'actions', actions: [flush] }], flushAccess, undefined, dataSource);
		await screen.findByRole('button', { name: 'row r1' });
		fireEvent.click(screen.getByRole('button', { name: 'Flush cache' }));
		await waitFor(() =>
			expect(toast.warning).toHaveBeenCalledWith(
				"Studio couldn't confirm whether Flush cache ran. Check whether it took effect before you run it again, "
					+ 'or it may run twice.',
			)
		);
		await waitFor(() => expect(dataSource.list).toHaveBeenCalledTimes(2));
		expect(toast.error).not.toHaveBeenCalled();
		logged.mockRestore();
	});

	it('says an action Harper refused failed, once, with its reason', async () => {
		const logged = silenced();
		const dataSource = testDataSource();
		vi.mocked(dataSource.send).mockRejectedValue(refused('cache_flush', 'The cache is locked'));
		renderSections([{ type: 'actions', actions: [flush] }], flushAccess, undefined, dataSource);
		fireEvent.click(screen.getByRole('button', { name: 'Flush cache' }));
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith('Flush cache failed', { description: 'The cache is locked' })
		);
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(toast.warning).not.toHaveBeenCalled();
		logged.mockRestore();
	});
});

describe('SectionsContent form refetches', () => {
	const settings: FormSection = {
		...form,
		fields: [...form.fields, { attribute: 'refreshMinutes', label: 'Refresh minutes', input: 'number' }],
	};

	function renderSettings(access = grant('Settings', 'read', 'update')) {
		const dataSource = testDataSource();
		vi.mocked(dataSource.get).mockResolvedValue({ id: 'default', origin: 'https://a.example', refreshMinutes: 60 });
		const queryClient = testQueryClient();
		renderSections([settings], access, undefined, dataSource, queryClient);
		return { dataSource, queryClient };
	}

	/**
	 * One stored record that writes change, read back as Harper projects it: an attribute the record lacks
	 * reads as null (harper resources/Table.ts:9031, forceNulls set at ResourceBridge.ts:773).
	 */
	function projectingStore(initial: ExtensionRecord | undefined) {
		const store = { record: initial };
		const dataSource = testDataSource();
		vi.mocked(dataSource.get).mockImplementation(async (_database, _table, primaryKey, _id, attributes) =>
			store.record
			&& Object.fromEntries([primaryKey, ...attributes].map((name) => [name, store.record?.[name] ?? null]))
		);
		vi.mocked(dataSource.insert).mockImplementation(async (_database, _table, record) => {
			store.record = { ...record };
		});
		vi.mocked(dataSource.update).mockImplementation(async (_database, _table, record) => {
			store.record = { ...store.record, ...record };
		});
		return { store, dataSource };
	}

	const saveButton = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
	const minutes = () => (screen.getByLabelText('Refresh minutes') as HTMLInputElement).value;

	it("reads only the form's key and fields", async () => {
		const { dataSource } = renderSettings();
		await screen.findByDisplayValue('https://a.example');
		expect(dataSource.get).toHaveBeenCalledWith('redirects', 'Settings', 'id', 'default', ['origin', 'refreshMinutes']);
	});

	it('takes a newer record at once while nothing is edited', async () => {
		const { dataSource, queryClient } = renderSettings();
		await screen.findByDisplayValue('https://a.example');
		vi.mocked(dataSource.get).mockResolvedValue({ id: 'default', origin: 'https://c.example', refreshMinutes: 60 });
		await queryClient.refetchQueries();
		expect(await screen.findByDisplayValue('https://c.example')).toBeTruthy();
		expect(screen.queryByRole('status')).toBeNull();
	});

	it("keeps the user's edits when the record changes underneath them, says so, and loads it on request", async () => {
		const { dataSource, queryClient } = renderSettings();
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		vi.mocked(dataSource.get).mockResolvedValue({ id: 'default', origin: 'https://c.example', refreshMinutes: 30 });
		await queryClient.refetchQueries();
		expect((await screen.findByRole('status')).textContent).toContain('This record changed since you opened it.');
		expect((screen.getByLabelText('Origin') as HTMLInputElement).value).toBe('https://b.example');
		fireEvent.click(screen.getByRole('button', { name: 'Discard my changes and load it' }));
		expect((screen.getByLabelText('Origin') as HTMLInputElement).value).toBe('https://c.example');
		expect((screen.getByLabelText('Refresh minutes') as HTMLInputElement).value).toBe('30');
		expect(screen.queryByRole('status')).toBeNull();
	});

	// Loading the newer values while still judging them against the old read would leave the note up and
	// Save on, and a save would then write the other writer's values back as if they were the user's edits.
	it('takes the newer record as the one the form opened when the user discards with a newer one waiting', async () => {
		const { dataSource, queryClient } = renderSettings();
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		vi.mocked(dataSource.get).mockResolvedValue({ id: 'default', origin: 'https://c.example', refreshMinutes: 30 });
		await queryClient.refetchQueries();
		await screen.findByRole('status');
		fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
		expect((screen.getByLabelText('Origin') as HTMLInputElement).value).toBe('https://c.example');
		expect(minutes()).toBe('30');
		expect(screen.queryByRole('status')).toBeNull();
		expect(saveButton().disabled).toBe(true);
	});

	it('saves only the fields the user changed while a newer record waits, then shows what it stored', async () => {
		const { store, dataSource } = projectingStore({ id: 'default', origin: 'https://a.example', refreshMinutes: 60 });
		const queryClient = testQueryClient();
		renderSections([settings], grant('Settings', 'read', 'update'), undefined, dataSource, queryClient);
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		store.record = { ...store.record, refreshMinutes: 30 };
		await queryClient.refetchQueries();
		await screen.findByRole('status');
		fireEvent.click(saveButton());
		await waitFor(() =>
			expect(dataSource.update).toHaveBeenCalledWith('redirects', 'Settings', {
				id: 'default',
				origin: 'https://b.example',
			}, 'id')
		);
		// The read-back holds the user's edit beside the other writer's change, so the form settles on both.
		await waitFor(() => expect(minutes()).toBe('30'));
		expect((screen.getByLabelText('Origin') as HTMLInputElement).value).toBe('https://b.example');
		expect(screen.queryByRole('status')).toBeNull();
		expect(saveButton().disabled).toBe(true);
	});

	it.each([
		['succeeds', false],
		['lands without an answer', true],
	])(
		'settles a first save that %s, though a field the user left unset reads back as null',
		async (_case, answerLost) => {
			const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
			const { store, dataSource } = projectingStore(undefined);
			if (answerLost) {
				vi.mocked(dataSource.insert).mockImplementation(async (_database, _table, record) => {
					store.record = { ...record };
					throw unanswered('insert');
				});
			}
			renderSections(
				[{
					...settings,
					fields: [form.fields[0], {
						attribute: 'refreshMinutes',
						label: 'Refresh minutes',
						input: 'number',
						defaultValue: 5,
					}],
				}],
				grant('Settings', 'read', 'insert', 'update'),
				undefined,
				dataSource,
			);
			fireEvent.change(await screen.findByDisplayValue('5'), { target: { value: '10' } });
			fireEvent.click(saveButton());
			await waitFor(() =>
				expect(dataSource.insert).toHaveBeenCalledWith(
					'redirects',
					'Settings',
					{ id: 'default', refreshMinutes: 10 },
					'id',
				)
			);
			await waitFor(() => expect(dataSource.get).toHaveBeenCalledTimes(2));
			await waitFor(() => expect(saveButton().disabled).toBe(true));
			expect(screen.queryByRole('status')).toBeNull();
			expect(screen.queryByText(/couldn't confirm/)).toBeNull();
			expect(minutes()).toBe('10');
			logged.mockRestore();
		},
	);

	it('says a record was removed even when its defaults match the edits', async () => {
		const { store, dataSource } = projectingStore({ id: 'default', origin: 'https://a.example', refreshMinutes: 60 });
		const queryClient = testQueryClient();
		renderSections(
			[{
				...settings,
				fields: [form.fields[0], {
					attribute: 'refreshMinutes',
					label: 'Refresh minutes',
					input: 'number',
					defaultValue: 5,
				}],
			}],
			grant('Settings', 'read', 'insert', 'update'),
			undefined,
			dataSource,
			queryClient,
		);
		fireEvent.change(await screen.findByDisplayValue('60'), { target: { value: '5' } });
		store.record = undefined;
		await queryClient.refetchQueries();
		expect((await screen.findByRole('status')).textContent).toContain('This record was removed since you opened it.');
		expect((screen.getByLabelText('Origin') as HTMLInputElement).value).toBe('https://a.example');
	});

	it("promises no save the viewer isn't offered for the record that replaced the one they opened", async () => {
		const removed = projectingStore({ id: 'default', origin: 'https://a.example', refreshMinutes: 60 });
		let queryClient = testQueryClient();
		renderSections([settings], grant('Settings', 'read', 'update'), undefined, removed.dataSource, queryClient);
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		removed.store.record = undefined;
		await queryClient.refetchQueries();
		const gone = await screen.findByRole('status');
		expect(gone.textContent).toContain('This record was removed since you opened it.');
		expect(gone.textContent).not.toContain('Saving');
		expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
		cleanup();

		const created = projectingStore(undefined);
		queryClient = testQueryClient();
		renderSections([settings], grant('Settings', 'read', 'insert'), undefined, created.dataSource, queryClient);
		const origin = (await screen.findByLabelText('Origin')) as HTMLInputElement;
		await waitFor(() => expect(origin.disabled).toBe(false));
		fireEvent.change(origin, { target: { value: 'https://b.example' } });
		created.store.record = { id: 'default', origin: 'https://c.example', refreshMinutes: 30 };
		await queryClient.refetchQueries();
		const changed = await screen.findByRole('status');
		expect(changed.textContent).toContain('This record changed since you opened it.');
		expect(changed.textContent).not.toContain('Saving');
		expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
	});

	it("reads each form on one record by its own fields, so neither shows the other one's projection", async () => {
		const { dataSource } = projectingStore({ id: 'default', origin: 'https://a.example', refreshMinutes: 60 });
		renderSections(
			[
				{ ...form, title: 'General' },
				{ ...settings, title: 'Advanced', fields: [settings.fields[1]] },
			],
			grant('Settings', 'read', 'update'),
			undefined,
			dataSource,
		);
		expect(await screen.findByDisplayValue('https://a.example')).toBeTruthy();
		await waitFor(() => expect(minutes()).toBe('60'));
	});

	it('says when the record was removed underneath the edits, and that saving creates it again', async () => {
		const { dataSource, queryClient } = renderSettings(grant('Settings', 'read', 'insert', 'update'));
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		vi.mocked(dataSource.get).mockResolvedValue(undefined);
		await queryClient.refetchQueries();
		expect((await screen.findByRole('status')).textContent).toContain(
			'This record was removed since you opened it. Saving creates it again from these values.',
		);
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() =>
			expect(dataSource.insert).toHaveBeenCalledWith('redirects', 'Settings', {
				id: 'default',
				origin: 'https://b.example',
				refreshMinutes: 60,
			}, 'id')
		);
	});

	it('takes a newer record that changed nothing the form shows without a note, keeping the edits', async () => {
		const { dataSource, queryClient } = renderSettings();
		fireEvent.change(await screen.findByDisplayValue('https://a.example'), { target: { value: 'https://b.example' } });
		vi.mocked(dataSource.get).mockResolvedValue({
			id: 'default',
			origin: 'https://a.example',
			refreshMinutes: 60,
			renderedHtml: '<html />',
		});
		await queryClient.refetchQueries();
		await waitFor(() => expect(dataSource.get).toHaveBeenCalledTimes(2));
		expect(screen.queryByRole('status')).toBeNull();
		expect((screen.getByLabelText('Origin') as HTMLInputElement).value).toBe('https://b.example');
	});
});
