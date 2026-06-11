import { describe, expect, it } from 'vitest';
import { detectPartialUpgrade } from './detectPartialUpgrade';

describe('detectPartialUpgrade', () => {
	it('returns null when every instance is on the same version', () => {
		expect(detectPartialUpgrade(['5.0.31', '5.0.31', '5.0.31'])).toBeNull();
	});

	it('returns null for fewer than two reported versions', () => {
		expect(detectPartialUpgrade([])).toBeNull();
		expect(detectPartialUpgrade(['5.0.31'])).toBeNull();
		expect(detectPartialUpgrade([undefined, null, '5.0.31'])).toBeNull();
	});

	it('detects the reported partial-upgrade scenario (one instance stuck on the old version)', () => {
		// First instance failed to upgrade and stayed on 5.0.31 while the rest reached 5.0.32.
		const result = detectPartialUpgrade(['5.0.31', '5.0.32', '5.0.32']);
		expect(result).toEqual({ latest: '5.0.32', behindCount: 1, total: 3 });
	});

	it('counts every instance behind the latest, including differing older versions', () => {
		const result = detectPartialUpgrade(['5.0.30', '5.0.31', '5.0.32']);
		expect(result).toEqual({ latest: '5.0.32', behindCount: 2, total: 3 });
	});

	it('ignores instances that are not yet reporting a version', () => {
		const result = detectPartialUpgrade(['5.0.31', undefined, '5.0.32', null]);
		expect(result).toEqual({ latest: '5.0.32', behindCount: 1, total: 2 });
	});

	it('treats the latest as the semver-highest, not the lexicographically-highest', () => {
		// "5.0.9" < "5.0.10" by semver, but "5.0.9" > "5.0.10" lexicographically.
		const result = detectPartialUpgrade(['5.0.9', '5.0.10']);
		expect(result).toEqual({ latest: '5.0.10', behindCount: 1, total: 2 });
	});
});
