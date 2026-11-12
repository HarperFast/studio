import {
	attributeValue,
	displayText,
	primitiveValue,
	UNREADABLE_VALUE,
} from '@/features/instance/extensions/content/displayText';
import { describe, expect, it } from 'vitest';

describe('displayText', () => {
	it.each([
		['a string, as it is', 'a <b>', 'a <b>'],
		['an empty string', '', ''],
		['a number', 1.5, '1.5'],
		['zero', 0, '0'],
		['NaN', Number.NaN, 'NaN'],
		['a boolean', false, 'false'],
		['a bigint', 12_345_678_901_234_567_890n, '12345678901234567890'],
		['null, as nothing', null, ''],
		['undefined, as nothing', undefined, ''],
		['an array, as JSON', [1, 'two', null], '[1,"two",null]'],
		['a nested object, as JSON', { a: { b: [1, { c: true }] } }, '{"a":{"b":[1,{"c":true}]}}'],
		['a bigint inside an object', { size: 2n ** 70n }, '{"size":"1180591620717411303424"}'],
	])('writes out %s', (_case, value, expected) => {
		expect(displayText(value)).toBe(expected);
	});

	it('writes out an object whose toString is not a function, which String() throws on', () => {
		const stored = JSON.parse('{"toString":null,"valueOf":null}');
		expect(() => String(stored)).toThrow(TypeError);
		expect(displayText(stored)).toBe('{"toString":null,"valueOf":null}');
	});

	it('falls back to fixed text for a value JSON cannot write', () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(displayText(cyclic)).toBe(UNREADABLE_VALUE);
		expect(displayText({ toJSON: () => undefined })).toBe(UNREADABLE_VALUE);
		expect(displayText(Symbol('s'))).toBe(UNREADABLE_VALUE);
	});
});

describe('attributeValue', () => {
	it("reads only the record's own attributes, never Object.prototype's", () => {
		expect(attributeValue({}, 'toString')).toBeUndefined();
		expect(attributeValue({}, 'constructor')).toBeUndefined();
		expect(attributeValue({ toString: 'mine' }, 'toString')).toBe('mine');
		expect(attributeValue(undefined, 'id')).toBeUndefined();
	});
});

describe('primitiveValue', () => {
	it('keeps primitives for sorting, and turns anything else into text String() can take', () => {
		expect(primitiveValue(3)).toBe(3);
		expect(primitiveValue('x')).toBe('x');
		expect(primitiveValue(true)).toBe(true);
		expect(primitiveValue(null)).toBeNull();
		const text = primitiveValue(JSON.parse('{"toString":null}'));
		expect(text).toBe('{"toString":null}');
		expect(String(text)).toBe('{"toString":null}');
	});
});
