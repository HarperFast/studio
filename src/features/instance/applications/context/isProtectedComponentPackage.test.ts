import { isProtectedComponentPackage } from '@/features/instance/applications/context/isProtectedComponentPackage';
import { describe, expect, it } from 'vitest';

describe('isProtectedComponentPackage', () => {
	it.each([
		'git+https://git@github.com/HarperDB/status-check-fabric.git#semver:v1.0.0',
		'git+https://git@github.com/HarperFast/status-check-fabric.git#semver:v1.0.0',
		'git+https://git@github.com/HarperFast/akamai-status.git#semver:v1.0.0',
		'@harperdb/akamai-status',
		'@harperdb/akamai-status@1.0.0',
	])('protects %s', (packageSpec) => {
		expect(isProtectedComponentPackage(packageSpec)).toBe(true);
	});

	it.each([
		undefined,
		'',
		'git+https://git@github.com/acme/customer-component.git#semver:v2.0.0',
		// A protected name is only a match as a whole segment.
		'@acme/my-akamai-status-probe',
		'git+https://git@github.com/acme/akamai-status-dashboard.git',
		'@acme/status-check-fabric-clone',
	])('does not protect %s', (packageSpec) => {
		expect(isProtectedComponentPackage(packageSpec)).toBe(false);
	});
});
