import { describe, expect, it } from 'vitest';
import type { ConfigFieldDef } from '../configSchemaFields';
import { fitsConfigField, parseConfigFieldText } from './ConfigFieldControl';

function field(kind: ConfigFieldDef['kind'], overrides: Partial<ConfigFieldDef> = {}): ConfigFieldDef {
	return { path: ['x'], id: 'config-x', label: 'X', kind, nullable: false, ...overrides };
}

describe('parseConfigFieldText', () => {
	it('trims text, so a stray space does not change how Harper reads a duration', () => {
		expect(parseConfigFieldText(field('string'), ' 3d ', '1d')).toEqual({ value: '3d' });
	});

	it('sends text as typed and a number as Harper reads it, and shows a value Harper stored as another type', () => {
		expect(parseConfigFieldText(field('string'), '3600', '1d')).toEqual({ value: '3600' });
		expect(parseConfigFieldText(field('string'), '{}', undefined)).toEqual({ value: '{}' });
		expect(fitsConfigField(field('string'), 3600)).toBe(true);
		expect(parseConfigFieldText(field('stringOrNumber'), '30', '3d')).toEqual({ value: 30 });
		expect(parseConfigFieldText(field('stringOrNumber'), '0x10', '3d')).toEqual({ value: 0 });
	});

	it("won't clear a duration Harper can't then read", () => {
		const timeout = field('string', { path: ['authentication', 'operationTokenTimeout'] });
		expect(parseConfigFieldText(timeout, '', '1d')).toEqual({ error: 'Enter a duration, such as 1d.' });
		expect(parseConfigFieldText(timeout, '', undefined)).toEqual({ value: undefined });
	});

	it('checks numbers against the schema', () => {
		expect(parseConfigFieldText(field('integer'), '1.5', 1)).toEqual({ error: 'Enter a whole number.' });
		expect(parseConfigFieldText(field('number', { minimum: 1 }), '0', 1)).toEqual({ error: 'Enter 1 or more.' });
		expect(parseConfigFieldText(field('number'), 'soon', 1)).toEqual({ error: 'Enter a number.' });
		expect(parseConfigFieldText(field('number'), ' 60 ', 1)).toEqual({ value: 60 });
	});

	it('clears a field back to what it was when it was unset or empty', () => {
		expect(parseConfigFieldText(field('number'), '', undefined)).toEqual({ value: undefined });
		expect(parseConfigFieldText(field('number', { nullable: true }), '', 5)).toEqual({ value: null });
		expect(parseConfigFieldText(field('number'), '', 5)).toEqual({ error: 'Enter a number.' });
		expect(parseConfigFieldText(field('string', { nullable: true }), '', '')).toEqual({ value: '' });
	});

	it('leaves a list that mixes null with origins to Advanced JSON, since a leading null opens the operations API', () => {
		const list = field('stringList', { nullable: true });
		expect(fitsConfigField(list, [null])).toBe(true);
		expect(fitsConfigField(list, ['https://a.example'])).toBe(true);
		expect(fitsConfigField(list, [null, 'https://a.example'])).toBe(false);
	});

	it("puts Harper's [null] list back when the box is cleared", () => {
		const list = field('stringList', { nullable: true });
		expect(parseConfigFieldText(list, '', [null])).toEqual({ value: [null] });
		expect(parseConfigFieldText(list, '', ['https://a.example'])).toEqual({ value: [] });
		expect(parseConfigFieldText(list, ' https://a.example \n\n', [null])).toEqual({ value: ['https://a.example'] });
	});
});
