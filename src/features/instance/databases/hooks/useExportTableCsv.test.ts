/**
 * @vitest-environment jsdom
 */
import { InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExportTableCsv } from './useExportTableCsv';

const componentSchema = vi.hoisted(() => ({ current: '' }));
const post = vi.hoisted(() =>
	vi.fn(async (_url: string, body: { operation: string }) => {
		switch (body.operation) {
			case 'get_components':
				return { data: { name: 'components', entries: [{ name: 'app', entries: [{ name: 'schema.graphql' }] }] } };
			case 'get_component_file':
				return { data: { message: componentSchema.current } };
			default:
				return { data: '', status: 200 };
		}
	})
);

vi.mock('@/config/useInstanceClient', () => {
	const params = { entityId: 'instance-1', instanceClient: { post }, entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});

const product2 = {
	schema: 'data',
	name: 'Product2',
	hash_attribute: 'id',
	attributes: [
		{ attribute: 'id', type: 'ID', is_primary_key: true },
		{ attribute: 'price', type: 'Float' },
		{ attribute: 'taxRate', type: 'Float' },
		{ attribute: 'totalPrice', type: 'Float', computed: true },
	],
} as InstanceTable;
const plain = { ...product2, attributes: product2.attributes.slice(0, 3) } as InstanceTable;

beforeEach(() => {
	URL.createObjectURL ??= () => 'blob:export';
	URL.revokeObjectURL ??= () => undefined;
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
	post.mockClear();
	componentSchema.current = '';
});

async function exportWith(params: Partial<Parameters<ReturnType<typeof useExportTableCsv>['exportCsv']>[0]>) {
	const queryClient = new QueryClient();
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client: queryClient }, children);
	const { result } = renderHook(() => useExportTableCsv(), { wrapper });
	await act(() =>
		result.current.exportCsv({ databaseName: 'data', tableName: 'Product2', primaryKey: 'id', ...params })
	);
	const csvCall = post.mock.calls.find((call) => (call as unknown[])[2] !== undefined);
	const [, body, config] = csvCall as unknown as [string, Record<string, unknown>, { headers: object }];
	return { body, config, operations: post.mock.calls.map((call) => call[1].operation) };
}

describe('useExportTableCsv', () => {
	it('names a computed attribute on the unfiltered export', async () => {
		const { body, config } = await exportWith({ instanceTable: product2 });
		expect(body.operation).toBe('search_by_value');
		expect(body.get_attributes).toEqual(['id', 'price', 'taxRate', 'totalPrice']);
		expect(config.headers).toEqual({ Accept: 'text/csv' });
	});

	// The filtered export is where a trailing '*' duplicates every named column on 4.7.40.
	it('names it on the filtered export too', async () => {
		const conditions = [{ search_attribute: 'price', search_type: 'equals' as const, search_value: 100 }];
		const { body } = await exportWith({ instanceTable: product2, conditions });
		expect(body.operation).toBe('search_by_conditions');
		expect(body.get_attributes).toEqual(['id', 'price', 'taxRate', 'totalPrice']);
	});

	// A legacy attribute registry can report a declared relationship as an untyped array, which a
	// named select would then resolve into records.
	it('leaves out a relationship only the component schema declares', async () => {
		componentSchema.current = 'type Product2 @table { id: ID @primaryKey parts: [Product2] @relationship(to: id) }';
		const legacy = {
			...product2,
			attributes: [...product2.attributes, { attribute: 'parts', type: 'array' }],
		} as InstanceTable;
		const { body } = await exportWith({ instanceTable: legacy, databaseTables: { Product2: legacy } });
		expect(body.get_attributes).toEqual(['id', 'price', 'taxRate', 'totalPrice']);
	});

	it('keeps the stored-record * export, with no schema read, when the table has no computed attribute', async () => {
		const { body, operations } = await exportWith({ instanceTable: plain });
		expect(body.get_attributes).toEqual(['*']);
		expect(operations).toEqual(['search_by_value']);
	});
});
