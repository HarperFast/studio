import { describe, expect, it } from 'vitest';
import { narrowsScope } from './grantScopeRules';

describe('narrowsScope', () => {
	it('widens by adding to an existing restriction', () => {
		expect(narrowsScope(['a'], ['a', 'b'])).toBe(false);
	});

	it('narrows by dropping one', () => {
		expect(narrowsScope(['a', 'b'], ['a'])).toBe(true);
	});

	// Unrestricted is the widest value, not the emptiest one — both of these turn on that.
	it('widens by clearing to unrestricted', () => {
		expect(narrowsScope(['a'], [])).toBe(false);
	});

	it('narrows by restricting something that was unrestricted', () => {
		expect(narrowsScope(null, ['a'])).toBe(true);
		expect(narrowsScope(undefined, ['a'])).toBe(true);
	});

	it('is not a narrowing when nothing changes', () => {
		expect(narrowsScope(['a', 'b'], ['b', 'a'])).toBe(false);
		expect(narrowsScope(null, [])).toBe(false);
	});
});
