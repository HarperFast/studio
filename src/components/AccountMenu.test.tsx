/** @vitest-environment jsdom */
import type { LocalUser, User } from '@/integrations/api/api.patch';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './AccountMenu';

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-a' }),
	Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a>,
}));
beforeAll(() => {
	window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	Object.assign(Element.prototype, {
		hasPointerCapture: () => false,
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		scrollIntoView: () => {},
	});
});
afterEach(cleanup);
const cloudUser = {
	id: 'u-a',
	firstname: 'Alex',
	lastname: 'User',
	email: 'alex@example.test',
	fabricRole: 'least_privileged',
	oauthConfigId: null,
	roles: {},
} as User;
const open = () =>
	fireEvent.pointerDown(screen.getByRole('button', { name: 'Account menu' }), { button: 0, ctrlKey: false });

describe('AccountMenu', () => {
	it('offers sign-out and appearance without cloud routes for a local account', () => {
		const signOut = vi.fn();
		render(<AccountMenu user={{ username: 'admin' } as LocalUser} onSignOut={signOut} signingOut={false} />);
		open();
		expect(screen.queryByRole('menuitem', { name: 'Profile' })).toBeNull();
		expect(screen.queryByRole('menuitem', { name: 'All organizations' })).toBeNull();
		expect(screen.getByRole('menuitem', { name: 'Appearance' })).toBeTruthy();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Sign Out' }));
		expect(signOut).toHaveBeenCalledOnce();
	});
	it('preserves cloud profile and discovery without pretending a zero-membership account can switch', () => {
		render(<AccountMenu user={cloudUser} onSignOut={vi.fn()} signingOut={false} />);
		open();
		expect(screen.getByRole('menuitem', { name: 'Profile' }).getAttribute('href')).toBe('/profile');
		expect(screen.getByRole('menuitem', { name: 'All organizations' })).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Switch organization' })).toBeNull();
		expect(screen.queryByRole('menuitem', { name: 'Admin' })).toBeNull();
	});
	it('prevents duplicate sign-out while the existing mutation is pending', () => {
		const signOut = vi.fn();
		render(<AccountMenu user={cloudUser} onSignOut={signOut} signingOut />);
		open();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Signing out…' }));
		expect(signOut).not.toHaveBeenCalled();
	});
});
