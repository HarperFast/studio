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

	// The Secrets nav gate (src/features/instance/config/index.tsx) floors at '5.2.0-alpha.1' rather
	// than '5.2.0' so the harper#1554 alpha/beta dev builds pass it too. Guard that intent: a plain
	// '5.2.0' floor would header-exclude every prerelease, hiding the page on the very builds it ships in.
	it('5.2.0-alpha.1 secrets gate admits 5.2 prereleases/rc/final but not pre-5.2 builds', () => {
		const gate = '5.2.0-alpha.1';
		expect(wasAReleasedBeforeB(gate, '5.1.15')).toBe(false); // current stage line — hidden
		expect(wasAReleasedBeforeB(gate, '5.2.0-alpha.1')).toBe(true); // earliest 5.2 prerelease — shown
		expect(wasAReleasedBeforeB(gate, '5.2.0-alpha.2')).toBe(true);
		expect(wasAReleasedBeforeB(gate, '5.2.0-beta.1')).toBe(true); // the shipping beta — shown
		expect(wasAReleasedBeforeB(gate, '5.2.0-rc.1')).toBe(true);
		expect(wasAReleasedBeforeB(gate, '5.2.0')).toBe(true); // final release — shown
		expect(wasAReleasedBeforeB(gate, '5.2.1')).toBe(true);
		expect(wasAReleasedBeforeB(gate, '5.2.0-alpha.1+abcdef')).toBe(true); // build metadata ignored
		// A plain '5.2.0' floor would wrongly hide the shipping prereleases — the bug this gate avoids:
		expect(wasAReleasedBeforeB('5.2.0', '5.2.0-alpha.1')).toBe(false);
	});
});

import { compareVersions } from './wasAReleasedBeforeB';

describe('compareVersions', () => {
	it('should sort an array of version strings', () => {
		const versions = [
			'1.2.3',
			'1.0.0',
			'2.0.0',
			'1.2.3-beta.1',
			'1.2.3-alpha',
		];
		const sorted = [...versions].sort(compareVersions);
		expect(sorted).toEqual([
			'1.0.0',
			'1.2.3-alpha',
			'1.2.3-beta.1',
			'1.2.3',
			'2.0.0',
		]);
	});

	it('should handle invalid versions by putting them at the beginning', () => {
		const versions = ['1.0.0', 'invalid', '2.0.0'];
		const sorted = [...versions].sort(compareVersions);
		expect(sorted[0]).toBe('invalid');
	});
});
