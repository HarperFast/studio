/**
 * @vitest-environment jsdom
 */
import { SectionsContent } from '@/features/instance/extensions/content/SectionsContent';
import type { ExtensionDataSource, ExtensionRecord } from '@/features/instance/extensions/dataSource';
import type {
	ExtensionAccess,
	ExtensionSection,
	ExtensionTableGrant,
	FormSection,
	TableSection,
} from '@/features/instance/extensions/manifest';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import type { ColumnDef } from '@/lib/table';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const table = vi.hoisted(() => ({ columns: [] as ColumnDef<ExtensionRecord>[] }));

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

afterEach(cleanup);

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

// No retries, so a failed read shows at once.
const testQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

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
		await waitFor(() => expect(dataSource.insert).toHaveBeenCalledWith('redirects', 'Rule', { source: '/new' }));
		expect(dataSource.update).not.toHaveBeenCalled();
	});

	it("edits with update, writing only the form's fields and the key", async () => {
		const dataSource = renderTable();
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		save('/changed');
		await waitFor(() =>
			expect(dataSource.update).toHaveBeenCalledWith('redirects', 'Rule', { id: 'r1', source: '/changed' })
		);
		expect(dataSource.insert).not.toHaveBeenCalled();
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
			expect(dataSource.update).toHaveBeenCalledWith('redirects', 'Rule', { id: 'r1', source: '/changed' })
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
			})
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

	it("never sends one of Harper's own operations", async () => {
		const dataSource = renderSections([{
			type: 'actions',
			actions: [{ label: 'Describe', request: { operation: 'describe_all' } }],
		}], { operations: ['describe_all'] });
		fireEvent.click(screen.getByRole('button', { name: 'Describe' }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(dataSource.send).not.toHaveBeenCalled();
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
