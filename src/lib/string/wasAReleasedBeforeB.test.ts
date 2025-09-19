import { describe, expect, it } from 'vitest';
import { wasAReleasedBeforeB } from './wasAReleasedBeforeB';

describe('wasAReleasedBeforeB (b >= a)', () => {
	it('stable > prerelease for same core', () => {
		expect(wasAReleasedBeforeB('4.7.0-beta.7', '4.7.0')).toBe(true);
		expect(wasAReleasedBeforeB('4.7.0', '4.7.0-beta.7')).toBe(false);
	});

	it('compares prerelease identifiers numerically', () => {
		expect(wasAReleasedBeforeB('4.7.0-beta.7', '4.7.0-beta.8')).toBe(true);
		expect(wasAReleasedBeforeB('4.7.0-beta.10', '4.7.0-beta.2')).toBe(false);
	});

	it('treats numeric prerelease as lower precedence than alphabetic', () => {
		expect(wasAReleasedBeforeB('1.0.0-1', '1.0.0-alpha')).toBe(true);
		expect(wasAReleasedBeforeB('1.0.0-alpha', '1.0.0-1')).toBe(false);
	});

	it('longer prerelease with equal prefix has higher precedence', () => {
		expect(wasAReleasedBeforeB('1.0.0-alpha', '1.0.0-alpha.1')).toBe(true);
		expect(wasAReleasedBeforeB('1.0.0-alpha.1', '1.0.0-alpha')).toBe(false);
	});

	it('compares major/minor/patch correctly', () => {
		expect(wasAReleasedBeforeB('4.7.0', '4.8.0')).toBe(true);
		expect(wasAReleasedBeforeB('4.7.0-beta.7', '5.0.0')).toBe(true);
		expect(wasAReleasedBeforeB('4.7.1', '4.7.2')).toBe(true);
		expect(wasAReleasedBeforeB('5.0.0', '4.99.99')).toBe(false);
	});

	it('treats missing patch/minor as 0', () => {
		expect(wasAReleasedBeforeB('1.2', '1.2.0')).toBe(true);
		expect(wasAReleasedBeforeB('1', '1.0.0')).toBe(true);
	});

	it('ignores build metadata in precedence', () => {
		expect(wasAReleasedBeforeB('1.2.3+build.5', '1.2.3+build.2')).toBe(true);
		expect(wasAReleasedBeforeB('1.2.3', '1.2.3+abc')).toBe(true);
	});

	it('equal versions return true', () => {
		expect(wasAReleasedBeforeB('3.4.5', '3.4.5')).toBe(true);
		expect(wasAReleasedBeforeB('3.4.5-beta.2', '3.4.5-beta.2')).toBe(true);
	});
});
