import { MAX_EXTRA_COLUMNS } from '@/features/instance/databases/functions/extraRecordAttributes';
import { InstanceDatabaseTableMap, InstanceTable } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import {
	buildExportGetAttributes,
	exportedRecords,
	parseJsonKeepingLargeIntegers,
	tableCsvColumns,
	tableCsvLines,
} from './tableCsv';

// As harper 5.3.2 describes `type Thing @table(database: "punch") { id: ID @primaryKey price: Float
// taxRate: Float totalPrice: Float @computed(from: "price * (1 + taxRate)") tags: [String] note: String }`
// with `include_computed` (attributes sorted by name).
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

const brand = {
	schema: 'punch',
	name: 'Brand',
	primary_key: 'id',
	attributes: [{ attribute: 'id', type: 'ID', is_primary_key: true }, { attribute: 'name', type: 'String' }],
} as InstanceTable;
// As harper 5.3.2 describes `brand: Brand @relationship(from: brandId)`.
const gadget = {
	schema: 'punch',
	name: 'Gadget',
	primary_key: 'id',
	attributes: [
		{ attribute: 'id', type: 'ID', is_primary_key: true },
		{ attribute: 'brandId', type: 'ID', indexed: {} },
		{ attribute: 'name', type: 'String' },
		{ attribute: 'brand', type: 'Brand' },
	],
} as InstanceTable;
const catalog: InstanceDatabaseTableMap = { Thing: thing, Brand: brand, Gadget: gadget };

// The records harper 5.3.2 answers `get_attributes: ['totalPrice', '*']` with: the computed value
// first, then every stored property, declared or not.
const thingRecords = [
	{
		totalPrice: 119,
		id: 'a1',
		price: 100,
		taxRate: 0.19,
		tags: ['red'],
		color: 'red',
		owners: ['ann', 'bo'],
		size: 3,
	},
	{ totalPrice: 55, id: 'a2', price: 50, taxRate: 0.1, note: 'second', color: 'blue' },
	{ totalPrice: 10, id: 'a3', price: 10, taxRate: 0, weight: 7 },
];

describe('buildExportGetAttributes', () => {
	it('names each computed attribute ahead of the *, as the grid does', () => {
		expect(buildExportGetAttributes(thing)).toEqual(['totalPrice', '*']);
	});

	it('names no relationship, so none is resolved', () => {
		const withComputed = {
			...gadget,
			attributes: [...gadget.attributes, { attribute: 'label', type: 'String', computed: true }],
		};
		expect(buildExportGetAttributes(withComputed)).toEqual(['label', '*']);
	});

	it('leaves the plain * to a table with no computed attribute', () => {
		expect(buildExportGetAttributes(brand)).toBeUndefined();
		expect(buildExportGetAttributes(undefined)).toBeUndefined();
	});
});

describe('tableCsvColumns', () => {
	it('lists the described attributes in describe order, then every undeclared property, most common first', () => {
		expect(tableCsvColumns(thingRecords, thing, catalog)).toEqual([
			'id',
			'note',
			'price',
			'tags',
			'taxRate',
			'totalPrice',
			'color',
			'owners',
			'size',
			'weight',
		]);
	});

	it('counts a property only the last record carries, however many records come before it', () => {
		const rows = [
			...Array.from({ length: 100 }, (_, index) => ({ id: `t${index}`, price: index })),
			{ id: 'late', price: 0, discontinued: true },
		];
		expect(tableCsvColumns(rows, thing, catalog).slice(-1)).toEqual(['discontinued']);
	});

	it('does not stop at the grid’s cap on extra columns', () => {
		const wide = Object.fromEntries(Array.from({ length: MAX_EXTRA_COLUMNS + 5 }, (_, index) => [`p${index}`, 1]));
		const extras = tableCsvColumns([{ id: 'w', ...wide }], thing, catalog).slice(thing.attributes.length);
		expect(extras).toHaveLength(MAX_EXTRA_COLUMNS + 5);
	});

	it('gives a table with no undeclared property just its described attributes', () => {
		expect(tableCsvColumns([{ id: 'b1', name: 'Acme' }], brand, catalog)).toEqual(['id', 'name']);
		expect(tableCsvColumns([], brand, catalog)).toEqual(['id', 'name']);
	});

	it('leaves relationships out, describe-detected or schema-declared, under either list', () => {
		const rows = [{ id: 'g1', brandId: 'b1', name: 'Widget', brand: { id: 'b1' }, parts: [], color: 'green' }];
		expect(tableCsvColumns(rows, gadget, catalog)).toEqual(['id', 'brandId', 'name', 'parts', 'color']);
		// A legacy attribute registry can report a declared relationship as an untyped array.
		const legacy = { ...gadget, attributes: [...gadget.attributes, { attribute: 'parts', type: 'array' }] };
		const declared = [{ attribute: 'parts', relatedTableName: 'Gadget', isToMany: true, to: 'parentId' }];
		expect(tableCsvColumns(rows, legacy, catalog, declared)).toEqual(['id', 'brandId', 'name', 'color']);
		// Harper 5.1 omits relationships from describe; the schema still names them.
		expect(tableCsvColumns(rows, gadget, catalog, declared)).toEqual(['id', 'brandId', 'name', 'color']);
	});
});

describe('tableCsvLines', () => {
	it('writes the file harper 5.3.2 would for the same columns', () => {
		const columns = tableCsvColumns(thingRecords, thing, catalog);
		expect(tableCsvLines(thingRecords, columns).join('')).toBe(
			'"id","note","price","tags","taxRate","totalPrice","color","owners","size","weight"\n'
				+ '"a1",,100,"[""red""]",0.19,119,"red","[""ann"",""bo""]",3,\n'
				+ '"a2","second",50,,0.1,55,"blue",,,\n'
				+ '"a3",,10,,0,10,,,,7\n',
		);
	});

	it('quotes text with its quotes doubled, and leaves null, undefined and empty text blank', () => {
		const rows = [{ a: 'say "hi", twice\nthen stop', b: null, c: undefined, d: '', e: false, f: { x: 1 } }];
		expect(tableCsvLines(rows, ['a', 'b', 'c', 'd', 'e', 'f'])[1]).toBe(
			'"say ""hi"", twice\nthen stop",,,,"false","{""x"":1}"\n',
		);
	});

	it('reads each cell from the record’s own properties only', () => {
		expect(tableCsvLines([{ id: 1 }], ['id', 'toString', 'constructor'])[1]).toBe('1,,\n');
	});
});

describe('parseJsonKeepingLargeIntegers', () => {
	// harper 5.3.2 writes a stored BigInt 98765432109876543210 as bare digits.
	const body = '[{"id":"w2","big":98765432109876543210,"ids":[12345678901234567890,1],"n":9007199254740991,'
		+ '"f":1.5,"e":-1e+21}]';

	it('keeps an integer too large for a double digit for digit through to the CSV', () => {
		const records = exportedRecords(body);
		expect(tableCsvLines(records, ['big', 'ids', 'n', 'f', 'e'])[1]).toBe(
			'"98765432109876543210","[12345678901234567890,1]",9007199254740991,1.5,-1e+21\n',
		);
	});

	it('parses everything else as JSON.parse does', () => {
		const [record] = parseJsonKeepingLargeIntegers(body) as Record<string, unknown>[];
		expect(record).toMatchObject({ id: 'w2', n: 9007199254740991, f: 1.5, e: -1e21 });
		expect(parseJsonKeepingLargeIntegers('[{"id":1,"name":"plain"}]')).toEqual([{ id: 1, name: 'plain' }]);
	});

	it('refuses an answer that is not a list of records', () => {
		expect(() => exportedRecords('{"error":"nope"}')).toThrow('not come back as a list of records');
		expect(exportedRecords([{ id: 1 }])).toEqual([{ id: 1 }]);
	});
});
