import { describe, expect, it } from 'vitest';
import { PRIVATE_COPY_OFF, privateCopyError, privateCopyFromSetting, privateCopyToSetting } from './privateCopyValue';

describe('privateCopyValue', () => {
	it('round-trips every setting', () => {
		for (const setting of [undefined, true, ['data', 'logs']] as const) {
			const copy = setting === undefined || setting === true ? setting : [...setting];
			expect(privateCopyToSetting(privateCopyFromSetting(copy))).toEqual(copy);
		}
	});

	it('leaves the setting out when off, whatever databases were picked before', () => {
		expect(privateCopyToSetting({ mode: 'off', databases: ['data'] })).toBeUndefined();
		expect(privateCopyToSetting({ mode: 'all', databases: ['data'] })).toBe(true);
	});

	it('refuses chosen databases with none picked, which would deploy with the copy off', () => {
		expect(privateCopyError({ mode: 'chosen', databases: [] })).toBe('Choose at least one database.');
		expect(privateCopyError({ mode: 'chosen', databases: ['data'] })).toBeUndefined();
		expect(privateCopyError(PRIVATE_COPY_OFF)).toBeUndefined();
	});
});
