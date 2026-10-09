import { describe, expect, it } from 'vitest';
import { isSupported } from './check-node-version.mjs';

describe('isSupported', () => {
	it('accepts a version inside the range', () => {
		expect(isSupported('>=24 <25', '24.21.0')).toBe(true);
	});

	it('rejects a version above the range', () => {
		expect(isSupported('>=24 <25', '26.2.0')).toBe(false);
	});

	it('rejects a version below the range', () => {
		expect(isSupported('>=24 <25', '23.9.0')).toBe(false);
	});

	it('throws instead of silently accepting a range it cannot parse', () => {
		expect(() => isSupported('^24.0.0', '22.0.0')).toThrow();
	});

	it.each(['>23 <25', '>=24.5.0 <25', '<=24', '>=24 25'])(
		'throws on a partial match instead of evaluating it loosely: %s',
		(range) => {
			expect(() => isSupported(range, '22.0.0')).toThrow();
		},
	);
});
