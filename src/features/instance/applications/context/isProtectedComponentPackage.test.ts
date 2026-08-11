import { isProtectedComponentPackage } from '@/features/instance/applications/context/isProtectedComponentPackage';
import { describe, expect, it } from 'vitest';

// The guard matches on repo name, not the full URL: it previously listed
// `github.com/HarperDB/...` and `github.com/HarperFast/...` separately, so the org rename
// silently unprotected every instance until a second literal was added.
describe('isProtectedComponentPackage', () => {
	it.each([
		'git+https://git@github.com/HarperDB/status-check-fabric.git#semver:v1.0.0',
		'git+https://git@github.com/HarperFast/status-check-fabric.git#semver:v1.0.0',
		'git+https://git@github.com/HarperFast/akamai-status.git#semver:v1.0.0',
		'@harperdb/akamai-status',
	])('protects %s', (packageSpec) => {
		expect(isProtectedComponentPackage(packageSpec)).toBe(true);
	});

	it.each([undefined, '', 'git+https://git@github.com/acme/customer-component.git#semver:v2.0.0'])(
		'does not protect %s',
		(packageSpec) => {
			expect(isProtectedComponentPackage(packageSpec)).toBe(false);
		},
	);
});
