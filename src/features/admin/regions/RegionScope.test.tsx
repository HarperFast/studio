/**
 * @vitest-environment jsdom
 */
import { RegionScope } from '@/features/admin/regions/index';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => cleanup());

const orgNameById = new Map([['org-1', 'Acme'], ['org-2', 'Globex']]);

describe('RegionScope', () => {
	it('treats an absent scope as public', () => {
		render(<RegionScope organizationIds={undefined} orgNameById={orgNameById} />);
		expect(screen.getByText('Public')).toBeTruthy();

		cleanup();
		render(<RegionScope organizationIds={null} orgNameById={orgNameById} />);
		expect(screen.getByText('Public')).toBeTruthy();
	});

	// Matches isRegionVisibleToOrg: only a non-empty list restricts, so [] reads the same as null.
	it('treats an empty scope as public', () => {
		render(<RegionScope organizationIds={[]} orgNameById={orgNameById} />);
		expect(screen.getByText('Public')).toBeTruthy();
	});

	it('lists scoped orgs as id + name', () => {
		render(<RegionScope organizationIds={['org-1', 'org-2']} orgNameById={orgNameById} />);
		expect(screen.getByText('org-1 (Acme)')).toBeTruthy();
		expect(screen.getByText('org-2 (Globex)')).toBeTruthy();
	});

	it('falls back to the bare id when the org name is unknown', () => {
		render(<RegionScope organizationIds={['org-missing']} orgNameById={orgNameById} />);
		expect(screen.getByText('org-missing')).toBeTruthy();
	});
});
