import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentUrlAfterHash } from './currentUrlAfterHash';

function setHash(hash: string) {
	vi.stubGlobal('location', { hash });
}

describe('currentUrlAfterHash', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns "/" when there is no hash', () => {
		setHash('');
		expect(currentUrlAfterHash()).toBe('/');
	});

	it('strips the "#" from a "#/" prefixed hash', () => {
		setHash('#/dashboard');
		expect(currentUrlAfterHash()).toBe('/dashboard');
	});

	it('preserves query strings within the hash route', () => {
		setHash('#/dashboard?tab=metrics');
		expect(currentUrlAfterHash()).toBe('/dashboard?tab=metrics');
	});

	it('returns the raw hash when it does not start with "#/"', () => {
		setHash('#section');
		expect(currentUrlAfterHash()).toBe('#section');
	});
});
