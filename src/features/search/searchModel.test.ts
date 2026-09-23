/** @vitest-environment jsdom */
import type { Organization, User } from '@/integrations/api/api.patch';
import { describe, expect, it, vi } from 'vitest';
import { isSearchShortcut } from './GlobalSearch';
import { buildSearchTargets, filterSearchTargets, loadSearchOrganizations } from './searchModel';

const role = (
	organizationName: string,
) => ({ organizationName, permission: { super_user: true } } as User['roles'][string]);
const user = {
	id: 'user',
	roles: { a: role('Alpha'), b: role('Beta'), locked: { ...role('Locked'), oauthProviders: [] } },
} as unknown as User;
const organization = (
	id: string,
) => ({
	id,
	name: id,
	clusters: [{ id: `cluster-${id}`, name: 'Production', status: 'RUNNING' }, {
		id: `removed-${id}`,
		name: 'Removed',
		status: 'REMOVED',
	}],
} as Organization);

describe('search targets', () => {
	it('finds duplicate names with organization context and excludes locked/deleted targets', () => {
		const targets = buildSearchTargets(user, new Map(['a', 'b', 'locked'].map(id => [id, organization(id)])));
		expect(targets).toHaveLength(4);
		expect(filterSearchTargets(targets, 'production beta').map(target => target.to)).toEqual(['/b/cluster-b']);
		expect(filterSearchTargets(targets, 'Production').map(target => target.organizationName)).toEqual([
			'Alpha',
			'Beta',
		]);
	});
	it('re-evaluates membership and cluster permission against the current user', () => {
		const snapshots = new Map(['a', 'b'].map(id => [id, organization(id)]));
		const revoked = {
			...user,
			roles: {
				a: { ...role('Alpha'), permission: { super_user: false }, organization: { clusters: { view: false } } },
			},
		} as unknown as User;
		expect(buildSearchTargets(revoked, snapshots).map(target => target.to)).toEqual(['/a']);
	});
	it('supports missing clusters and missing organization names', () => {
		const anonymousName = { ...user, roles: { a: role('') } };
		expect(buildSearchTargets(anonymousName, new Map([['a', { id: 'a' } as Organization]]))[0].name).toBe('a');
	});
});

describe('bounded organization loading', () => {
	it('starts at most four reads and continues after a rejection', async () => {
		let active = 0;
		let maximum = 0;
		const result = vi.fn();
		await loadSearchOrganizations(
			['a', 'b', 'c', 'd', 'e', 'f'],
			async id => {
				active++;
				maximum = Math.max(maximum, active);
				await Promise.resolve();
				active--;
				if (id === 'b') { throw new Error('Unavailable'); }
				return organization(id);
			},
			result,
			() => false,
		);
		expect(maximum).toBe(4);
		expect(result).toHaveBeenCalledTimes(6);
		expect(result).toHaveBeenCalledWith('b', null);
	});
	it('drops late results and stops queuing after the dialog closes', async () => {
		let cancelled = false;
		let release!: () => void;
		const pending = new Promise<void>(resolve => {
			release = resolve;
		});
		const load = vi.fn(async (id: string) => {
			await pending;
			return organization(id);
		});
		const result = vi.fn();
		const done = loadSearchOrganizations(['a', 'b', 'c', 'd', 'e'], load, result, () => cancelled);
		cancelled = true;
		release();
		await done;
		expect(load).toHaveBeenCalledTimes(4);
		expect(result).not.toHaveBeenCalled();
	});
});

describe('search shortcut', () => {
	it('accepts either platform modifier while respecting already-handled shortcuts', () => {
		expect(isSearchShortcut(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))).toBe(true);
		expect(isSearchShortcut(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))).toBe(true);
		const handled = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
		handled.preventDefault();
		expect(isSearchShortcut(handled)).toBe(false);
	});
	it.each(['input', 'textarea', '[contenteditable]', '.monaco-editor'])('leaves %s editing alone', selector => {
		const element = document.createElement(selector === 'input' || selector === 'textarea' ? selector : 'div');
		if (selector === '[contenteditable]') {
			element.contentEditable = 'true';
			element.setAttribute('contenteditable', 'true');
		}
		if (selector === '.monaco-editor') { element.className = 'monaco-editor'; }
		let accepted = true;
		element.addEventListener('keydown', event => {
			accepted = !!isSearchShortcut(event as KeyboardEvent);
		});
		element.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
		expect(accepted).toBe(false);
	});
});
