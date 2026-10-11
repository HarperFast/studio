import type { EntityMenuItem } from '@/components/ui/entityMenu';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { type AbsolutePath, buildAbsoluteLinkToPage } from './buildAbsoluteLinkToPage';

describe('buildAbsoluteLinkToPage', () => {
	it.each([
		[{}, undefined, '/'],
		[{ organizationId: 'org-a' }, undefined, '/org-a'],
		[{ organizationId: 'org-a' }, 'roles', '/org-a/roles'],
		[{ organizationId: 'org-a', clusterId: 'clu-b' }, 'edit/version', '/org-a/clu-b/edit/version'],
		[
			{ organizationId: 'org-a', clusterId: 'clu-b', instanceId: 'ins-c' },
			'sign-in',
			'/org-a/clu-b/instance/ins-c/sign-in',
		],
	])('builds %o + %s as %s', (ids, page, expected) => {
		expect(buildAbsoluteLinkToPage(ids, page)).toBe(expected);
	});

	it('is typed as an absolute path, the only target an entity menu item accepts', () => {
		expectTypeOf(buildAbsoluteLinkToPage({ organizationId: 'org-a' })).toEqualTypeOf<AbsolutePath>();
		const items: EntityMenuItem[] = [
			{ key: 'absolute', label: 'Roles', to: buildAbsoluteLinkToPage({ organizationId: 'org-a' }, 'roles') },
			// @ts-expect-error a relative target re-resolves against wherever the router is when the menu renders
			{ key: 'relative', label: 'Roles', to: 'org-a/roles' },
		];

		expect(items).toHaveLength(2);
	});
});
