import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { isProtectedPath } from '@/features/instance/applications/context/isProtectedComponentPackage';
import { describe, expect, it } from 'vitest';

// The delete modal deletes a whole selection, reached from a global shortcut that checks nothing,
// so protection has to be resolvable from a bare tree path rather than a capability flag.
const rootEntries: DirectoryEntry[] = [
	{
		name: 'status-check',
		path: 'status-check',
		project: 'status-check',
		package: '@harperdb/akamai-status@1.0.0',
		entries: [],
	},
	{ name: 'anvils', path: 'anvils', project: 'anvils', entries: [] },
];

describe('isProtectedPath', () => {
	it.each(['status-check', 'status-check/resources.js', 'status-check/akamai/sureroute-test-object.html'])(
		'protects %s and everything under it',
		(path) => {
			expect(isProtectedPath(rootEntries, path)).toBe(true);
		},
	);

	it.each(['anvils', 'anvils/resources.js'])('does not protect %s', (path) => {
		expect(isProtectedPath(rootEntries, path)).toBe(false);
	});

	// Fail closed: refusing a legitimate delete costs a reload; allowing a wrong one drops the
	// instance out of the load balancer.
	it.each([['unresolved root', rootEntries, 'unknown-project/file.js'], ['tree not loaded', [], 'anvils']] as const)(
		'protects on %s',
		(_label, entries, path) => {
			expect(isProtectedPath(entries, path)).toBe(true);
		},
	);
});
