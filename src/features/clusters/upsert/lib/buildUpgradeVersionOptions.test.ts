import { describe, expect, it } from 'vitest';
import { buildUpgradeVersionOptions } from './buildUpgradeVersionOptions';
import { UpgradeCandidateInstance } from './detectPartialUpgrade';

const stable = { name: 'stable', version: '5.2.13' };
const next = { name: 'next', version: '5.3.0-beta.1' };
const oldStable = { name: 'stable-v4', version: '4.7.36' };
const pinned = { name: 'acme-pin', version: '5.1.20', scoped: true };

/** Build an instance with the given version; defaults to a live (RUNNING) status. */
const inst = (version?: string | null, status: string = 'RUNNING'): UpgradeCandidateInstance => ({ version, status });
const running = (...versions: string[]) => versions.map(v => inst(v));

function labels(options: ReturnType<typeof buildUpgradeVersionOptions>) {
	return options.map(o => `${o.version} ${o.name}`);
}

describe('buildUpgradeVersionOptions', () => {
	it('shows the highest running version once as current, then only newer global releases', () => {
		const result = buildUpgradeVersionOptions([oldStable, stable, next], running('5.2.0', '5.2.0'));
		expect(labels(result)).toEqual(['5.2.0 current', '5.2.13 stable', '5.3.0-beta.1 next']);
	});

	it('offers a scoped version older than the current one', () => {
		const result = buildUpgradeVersionOptions([oldStable, pinned, stable], running('5.2.13'));
		expect(labels(result)).toEqual(['5.2.13 current', '5.1.20 acme-pin']);
		expect(result[1].scoped).toBe(true);
	});

	it('still hides a global version older than the current one', () => {
		const result = buildUpgradeVersionOptions([oldStable, stable], running('5.2.13'));
		expect(labels(result)).toEqual(['5.2.13 current']);
	});

	it('offers a scoped version from an older major, since scope is release targeting and not a compatibility check', () => {
		// The org may hold the pin for a legacy cluster; every cluster in the org sees it, and the picker
		// does not judge whether a v4 binary can open this cluster's store. That is a product call recorded
		// in DESIGN.md, and this pins the current answer so a change to it is deliberate.
		const result = buildUpgradeVersionOptions(
			[stable, { ...oldStable, name: 'legacy-pin', scoped: true }],
			running('5.2.13'),
		);
		expect(labels(result)).toEqual(['5.2.13 current', '4.7.36 legacy-pin']);
	});

	it('offers a scoped version newer than the current one', () => {
		const result = buildUpgradeVersionOptions([stable, { ...pinned, version: '5.3.1' }], running('5.2.13'));
		expect(labels(result)).toEqual(['5.2.13 current', '5.3.1 acme-pin']);
	});

	it('shows a scoped version equal to the current one only as current', () => {
		const result = buildUpgradeVersionOptions([pinned, stable], running('5.1.20'));
		expect(labels(result)).toEqual(['5.1.20 current', '5.2.13 stable']);
	});

	it('keeps offering a scoped version some instances already run, so a mixed cluster can converge on it', () => {
		// One instance is on the pinned build, another was upgraded past it; picking the pin again is
		// the way back to a uniform cluster, whereas a global version already running stays hidden.
		const result = buildUpgradeVersionOptions([pinned, stable], running('5.1.20', '5.2.13'));
		expect(labels(result)).toEqual(['5.2.13 current', '5.1.20 acme-pin']);
	});

	it('hides a global version any instance already runs, even below current', () => {
		const result = buildUpgradeVersionOptions(
			[{ name: 'deployed on prod', version: '5.2.0' }, stable],
			running('5.2.0', '5.2.13'),
		);
		expect(labels(result)).toEqual(['5.2.13 current']);
	});

	it('ignores terminating, terminated and removed instances when picking current', () => {
		// A terminated instance still reporting a higher version must not become `current`, or the
		// version every live instance runs would be offered back to the cluster as a change.
		const instances = [inst('5.2.13'), inst('5.2.13'), inst('5.3.0', 'TERMINATED'), inst('5.3.0', 'REMOVED')];
		const result = buildUpgradeVersionOptions([pinned, stable, next], instances);
		expect(labels(result)).toEqual(['5.2.13 current', '5.1.20 acme-pin', '5.3.0-beta.1 next']);
	});

	it('ignores instances that report no version', () => {
		const result = buildUpgradeVersionOptions([stable], [inst('5.2.0'), inst(undefined), inst(null), null]);
		expect(labels(result)).toEqual(['5.2.0 current', '5.2.13 stable']);
	});

	it('passes every offered version through when no live instance reports a version', () => {
		const result = buildUpgradeVersionOptions([oldStable, pinned, stable], [inst('5.3.0', 'TERMINATED')]);
		expect(labels(result)).toEqual(['4.7.36 stable-v4', '5.1.20 acme-pin', '5.2.13 stable']);
	});

	it('picks current by semver, not lexicographically', () => {
		const result = buildUpgradeVersionOptions([stable], running('5.2.9', '5.2.10'));
		expect(labels(result)).toEqual(['5.2.10 current', '5.2.13 stable']);
	});
});
