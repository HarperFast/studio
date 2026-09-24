// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SectionRail } from './SectionRail';

vi.mock('@/components/OrganizationSwitcher', () => ({ OrganizationSwitcher: () => null }));
vi.mock('@/components/SubNavRail', () => ({ SubNavRail: () => null }));

const key = 'studio:sidebar-help:minimized:v1';
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	localStorage.removeItem(key);
});

describe('help card preference', () => {
	it('remembers minimization and restores expanded content', () => {
		const first = render(<SectionRail items={[]} ariaLabel="Navigation" />);
		fireEvent.click(screen.getByRole('button', { name: 'Minimize help card' }));
		expect(localStorage.getItem(key)).toBe('1');
		expect(screen.queryByRole('link', { name: /View docs/ })).toBeNull();
		first.unmount();
		render(<SectionRail items={[]} ariaLabel="Navigation" />);
		fireEvent.click(screen.getByRole('button', { name: 'Expand help card' }));
		expect(localStorage.getItem(key)).toBe('0');
		expect(screen.getByRole('link', { name: /View docs/ })).toBeTruthy();
	});

	it('still toggles when reading and writing storage are blocked', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		render(<SectionRail items={[]} ariaLabel="Navigation" />);
		fireEvent.click(screen.getByRole('button', { name: 'Minimize help card' }));
		expect(screen.queryByRole('link', { name: /View docs/ })).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Expand help card' }));
		expect(screen.getByRole('link', { name: /View docs/ })).toBeTruthy();
	});
});
