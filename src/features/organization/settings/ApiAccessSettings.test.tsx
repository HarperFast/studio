/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { canManage } = vi.hoisted(() => ({ canManage: { value: true } }));
vi.mock('@/hooks/usePermissions', () => ({ useCanManageServiceAccounts: () => canManage.value }));
vi.mock('@/features/organization/settings/ApiTokensSetting', () => ({
	ApiTokensSetting: ({ enabled }: { enabled: boolean }) => <div>api tokens switch, enabled={String(enabled)}</div>,
}));
vi.mock('@/features/organization/serviceAccounts/ServiceAccountsSection', () => ({
	ServiceAccountsSection: ({ organizationId }: { organizationId: string }) => (
		<div>service accounts of {organizationId}</div>
	),
}));

import { ApiAccessSettings } from './ApiAccessSettings';

beforeEach(() => {
	canManage.value = true;
});

afterEach(cleanup);

describe('ApiAccessSettings', () => {
	it('shows an organization admin the token switch and the service accounts', () => {
		render(<ApiAccessSettings organizationId="org-1" apiTokensEnabled />);
		expect(screen.getByRole('heading', { name: 'API access' })).toBeTruthy();
		expect(screen.getByText('api tokens switch, enabled=true')).toBeTruthy();
		expect(screen.getByText('service accounts of org-1')).toBeTruthy();
	});

	it('shows nothing to a member who can open settings but is not an admin', () => {
		canManage.value = false;
		const { container } = render(<ApiAccessSettings organizationId="org-1" apiTokensEnabled={false} />);
		expect(container.innerHTML).toBe('');
	});
});
