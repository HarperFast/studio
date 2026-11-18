import { describe, expect, it } from 'vitest';
import type { ConfigFieldDef } from '../configSchemaFields';
import { castHarperText, fitsConfigField, parseConfigFieldText } from './ConfigFieldControl';

function field(kind: ConfigFieldDef['kind'], overrides: Partial<ConfigFieldDef> = {}): ConfigFieldDef {
	return { path: ['x'], id: 'config-x', label: 'X', kind, nullable: false, ...overrides };
}

describe('castHarperText, as harper castConfigValue stores text', () => {
	it.each([
		['3600', 3600],
		['1.5', 1.5],
		['true', true],
		['FALSE', false],
		['undefined', null],
		['null', null],
		['["a"]', ['a']],
		['[a]', '[a]'],
		['3d', '3d'],
	])('%s → %j', (text, stored) => {
		expect(castHarperText(text)).toEqual(stored);
	});
});

describe('parseConfigFieldText', () => {
	it('trims text, so a stray space does not change how Harper reads a duration', () => {
		expect(parseConfigFieldText(field('string'), ' 3d ', '1d')).toEqual({ value: '3d' });
	});

	it('sends text the way Harper will store it, so a save does not come back as a change', () => {
		expect(parseConfigFieldText(field('string'), '3600', '1d')).toEqual({ value: 3600 });
		expect(fitsConfigField(field('string'), 3600)).toBe(true);
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
	});

	it("puts Harper's [null] list back when the box is cleared", () => {
		const list = field('stringList', { nullable: true });
		expect(parseConfigFieldText(list, '', [null])).toEqual({ value: [null] });
		expect(parseConfigFieldText(list, '', ['https://a.example'])).toEqual({ value: [] });
		expect(parseConfigFieldText(list, ' https://a.example \n\n', [null])).toEqual({ value: ['https://a.example'] });
	});
});
