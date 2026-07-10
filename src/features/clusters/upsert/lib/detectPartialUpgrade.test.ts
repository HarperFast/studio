import { describe, expect, it } from 'vitest';
import { detectPartialUpgrade, UpgradeCandidateInstance } from './detectPartialUpgrade';

/** Build an instance with the given version; defaults to a live (RUNNING) status. */
const inst = (version?: string | null, status: string = 'RUNNING'): UpgradeCandidateInstance => ({ version, status });

describe('detectPartialUpgrade', () => {
	it('returns null when every instance is on the same version', () => {
		expect(detectPartialUpgrade([inst('5.0.31'), inst('5.0.31'), inst('5.0.31')])).toBeNull();
	});

	it('returns null for fewer than two reported versions', () => {
		expect(detectPartialUpgrade([])).toBeNull();
		expect(detectPartialUpgrade([inst('5.0.31')])).toBeNull();
		expect(detectPartialUpgrade([inst(undefined), inst(null), inst('5.0.31')])).toBeNull();
	});

	it('detects the reported partial-upgrade scenario (one instance stuck on the old version)', () => {
		// First instance failed to upgrade and stayed on 5.0.31 while the rest reached 5.0.32.
		const result = detectPartialUpgrade([inst('5.0.31'), inst('5.0.32'), inst('5.0.32')]);
		expect(result).toEqual({ latest: '5.0.32', behindCount: 1, total: 3 });
	});

	it('counts every instance behind the latest, including differing older versions', () => {
		const result = detectPartialUpgrade([inst('5.0.30'), inst('5.0.31'), inst('5.0.32')]);
		expect(result).toEqual({ latest: '5.0.32', behindCount: 2, total: 3 });
	});

	it('ignores instances that are not yet reporting a version', () => {
		const result = detectPartialUpgrade([inst('5.0.31'), inst(undefined), inst('5.0.32'), inst(null)]);
		expect(result).toEqual({ latest: '5.0.32', behindCount: 1, total: 2 });
	});

	it('treats the latest as the semver-highest, not the lexicographically-highest', () => {
		// "5.0.9" < "5.0.10" by semver, but "5.0.9" > "5.0.10" lexicographically.
		const result = detectPartialUpgrade([inst('5.0.9'), inst('5.0.10')]);
		expect(result).toEqual({ latest: '5.0.10', behindCount: 1, total: 2 });
	});

	it('excludes terminated/removed instances, so their stale version does not fake a partial upgrade', () => {
		// The two live instances are both on 5.1.17; only terminated instances lag behind.
		const result = detectPartialUpgrade([
			inst('5.1.17'),
			inst('5.1.17'),
			inst('5.0.31', 'TERMINATED'),
			inst('5.0.31', 'TERMINATING'),
			inst('5.0.31', 'REMOVED'),
		]);
		expect(result).toBeNull();
	});

	it('only counts live instances when a genuine partial upgrade coexists with terminated ones', () => {
		const result = detectPartialUpgrade([
			inst('5.1.16'),
			inst('5.1.17'),
			inst('5.1.17'),
			inst('5.0.31', 'TERMINATED'),
		]);
		expect(result).toEqual({ latest: '5.1.17', behindCount: 1, total: 3 });
	});
});
