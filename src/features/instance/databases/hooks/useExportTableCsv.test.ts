/**
 * @vitest-environment jsdom
 */
import { InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExportTableCsv } from './useExportTableCsv';

type GetAttribute = string | { name: string; select: string[] };
interface Body {
	operation: string;
	get_attributes?: GetAttribute[];
	allowFullScan?: boolean;
}

const instance = vi.hoisted(() => ({
	componentSchema: '',
	records: [] as Record<string, unknown>[],
	/** Raw JSON to answer with instead of `records`, for values JSON.stringify can't write. */
	body: undefined as string | undefined,
	computed: {} as Record<string, (record: Record<string, unknown>) => unknown>,
}));

// As harper 5.3.2 answers a search: a name in `get_attributes` resolves that attribute, and the `'*'`
// after it copies every property the record stores, declared or not. With `responseType: 'text'` the
// body comes back unparsed.
const post = vi.hoisted(() =>
	vi.fn(async (_url: string, body: Body, config?: { responseType?: string }) => {
		switch (body.operation) {
			case 'get_components':
				return { data: { name: 'components', entries: [{ name: 'app', entries: [{ name: 'schema.graphql' }] }] } };
			case 'get_component_file':
				return { data: { message: instance.componentSchema } };
			case 'search_by_value':
			case 'search_by_conditions': {
				const select = body.get_attributes ?? ['*'];
				const rows = select[0] === '*' ? instance.records : instance.records.map((record) => {
					const row: Record<string, unknown> = {};
					for (const attribute of select) {
						if (attribute === '*') {
							Object.assign(row, record);
						} else if (typeof attribute === 'string') {
							row[attribute] = instance.computed[attribute]?.(record) ?? null;
						}
					}
					return row;
				});
				const text = instance.body ?? JSON.stringify(rows);
				return { data: config?.responseType === 'text' ? text : JSON.parse(text), status: 200 };
			}
			default:
				return { data: [], status: 200 };
		}
	})
);

vi.mock('@/config/useInstanceClient', () => {
	const params = { entityId: 'instance-1', instanceClient: { post }, entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});

// As harper 5.3.2 describes punch.Thing with `include_computed` (attributes sorted by name).
const thing = {
	schema: 'punch',
	name: 'Thing',
	primary_key: 'id',
	attributes: [
		{ attribute: 'id', type: 'ID', is_primary_key: true },
		{ attribute: 'note', type: 'String' },
		{ attribute: 'price', type: 'Float' },
		{ attribute: 'tags', type: 'array', elements: 'String' },
		{ attribute: 'taxRate', type: 'Float' },
		{ attribute: 'totalPrice', type: 'Float', computed: true },
	],
} as InstanceTable;
const thingRecords = [
	{ id: 'a1', price: 100, taxRate: 0.19, tags: ['red'], color: 'red', owners: ['ann', 'bo'], size: 3 },
	{ id: 'a2', price: 50, taxRate: 0.5, note: 'second', color: 'blue' },
	{ id: 'a3', price: 10, taxRate: 0, weight: 7 },
];
const totalPrice = (record: Record<string, unknown>) => (record.price as number) * (1 + (record.taxRate as number));
const thingCsv = '"id","note","price","tags","taxRate","totalPrice","color","owners","size","weight"\n'
	+ '"a1",,100,"[""red""]",0.19,119,"red","[""ann"",""bo""]",3,\n'
	+ '"a2","second",50,,0.5,75,"blue",,,\n'
	+ '"a3",,10,,0,10,,,,7\n';

const plain = {
	schema: 'punch',
	name: 'Plain',
	primary_key: 'id',
	attributes: [{ attribute: 'id', type: 'ID', is_primary_key: true }, { attribute: 'name', type: 'String' }],
} as InstanceTable;

let createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>;

beforeEach(() => {
	createObjectURL = vi.fn((_blob: Blob) => 'blob:export');
	URL.createObjectURL = createObjectURL;
	URL.revokeObjectURL ??= () => undefined;
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
	post.mockClear();
	instance.componentSchema = '';
	instance.records = [];
	instance.body = undefined;
	instance.computed = {};
});

async function exportWith(params: Partial<Parameters<ReturnType<typeof useExportTableCsv>['exportCsv']>[0]>) {
	const queryClient = new QueryClient();
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client: queryClient }, children);
	const { result } = renderHook(() => useExportTableCsv(), { wrapper });
	await act(() => result.current.exportCsv({ databaseName: 'punch', tableName: 'Thing', primaryKey: 'id', ...params }));
	const searchCall = post.mock.calls.find((call) => call[1].operation.startsWith('search_by_'));
	const [, body, config] = searchCall as unknown as [string, Body, { responseType?: string; headers?: object }];
	expect(createObjectURL).toHaveBeenCalledTimes(1);
	const csv = await createObjectURL.mock.calls[0][0].text();
	return { body, config, csv };
}

describe('useExportTableCsv', () => {
	it('writes every record property, declared or not, after the computed value, on the unfiltered export', async () => {
		instance.records = thingRecords;
		instance.computed = { totalPrice };
		const { body, config, csv } = await exportWith({ instanceTable: thing });
		expect(body.operation).toBe('search_by_value');
		expect(body.get_attributes).toEqual(['totalPrice', '*']);
		expect(config.responseType).toBe('text');
		expect(config.headers).toBeUndefined();
		expect(csv).toBe(thingCsv);
	});

	it('writes them on the filtered export too', async () => {
		instance.records = thingRecords;
		instance.computed = { totalPrice };
		const conditions = [{ search_attribute: 'price', search_type: 'greater_than' as const, search_value: 0 }];
		const { body, csv } = await exportWith({ instanceTable: thing, conditions });
		expect(body.operation).toBe('search_by_conditions');
		expect(body.get_attributes).toEqual(['totalPrice', '*']);
		expect(csv).toBe(thingCsv);
	});

	it('carries the consent to a full scan that the filter was applied with', async () => {
		const conditions = [{ search_attribute: 'taxRate', search_type: 'equals' as const, search_value: 0.19 }];
		const { body } = await exportWith({ instanceTable: thing, conditions, allowFullScan: true });
		expect(body.allowFullScan).toBe(true);
	});

	// No select to name, so the '*' alone; the undeclared properties still come from every record.
	it('writes the undeclared properties of a table with no computed attribute', async () => {
		instance.records = [{ id: 'p1', name: 'one' }, { id: 'p2', name: 'two', extra: 'x', flag: true }];
		const { body, csv } = await exportWith({ tableName: 'Plain', instanceTable: plain });
		expect(body.get_attributes).toEqual(['*']);
		expect(csv).toBe('"id","name","extra","flag"\n"p1","one",,\n"p2","two","x","true"\n');
	});

	// A `@sealed` table refuses an undeclared property ("Property extra is not allowed"), so its file is
	// its described attributes, a column even for one no record holds.
	it('writes just the described attributes of a sealed table', async () => {
		instance.records = [{ id: 'l1' }];
		const { csv } = await exportWith({ tableName: 'Locked', instanceTable: { ...plain, name: 'Locked' } });
		expect(csv).toBe('"id","name"\n"l1",\n');
	});

	// A legacy attribute registry can report a declared relationship as an untyped array.
	it('leaves out a relationship only the component schema declares', async () => {
		instance.componentSchema =
			'type Thing @table(database: "punch") { id: ID @primaryKey parts: [Thing] @relationship(to: id) }';
		instance.records = [{ id: 'a1', price: 1, taxRate: 0, parts: [] }];
		instance.computed = { totalPrice };
		const legacy = {
			...thing,
			attributes: [...thing.attributes, { attribute: 'parts', type: 'array' }],
		} as InstanceTable;
		const { body, csv } = await exportWith({ instanceTable: legacy, databaseTables: { Thing: legacy } });
		expect(body.get_attributes).toEqual(['totalPrice', '*']);
		expect(csv).toBe('"id","note","price","tags","taxRate","totalPrice"\n"a1",,1,,0,1\n');
	});

	it('keeps the digits of an integer too large for a double', async () => {
		instance.body = '[{"id":"w2","big":98765432109876543210}]';
		const { csv } = await exportWith({ tableName: 'Wide', instanceTable: plain });
		expect(csv).toBe('"id","name","big"\n"w2",,"98765432109876543210"\n');
	});
});
