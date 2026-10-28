/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	current: { setting: undefined as string[] | true | undefined, known: false },
}));

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'ins-1', entityType: 'instance' }),
}));
vi.mock('@/features/instance/applications/hooks/useBranchedDatabases', () => ({
	useApplicationBranchedDatabases: () => mocks.current,
}));

import { PrivateCopyIndicator } from './PrivateCopyIndicator';

afterEach(() => {
	cleanup();
	mocks.current = { setting: undefined, known: false };
});

describe('PrivateCopyIndicator', () => {
	it('names the databases the application runs a copy of', () => {
		mocks.current = { setting: ['data'], known: true };
		render(<PrivateCopyIndicator project="web" />);

		expect(screen.getByText('Private copy: data')).toBeTruthy();
	});

	it("shows nothing while the setting may be out of date, so it can't claim a copy that was just turned off", () => {
		mocks.current = { setting: ['data'], known: false };
		render(<PrivateCopyIndicator project="web" />);

		expect(screen.queryByText(/Private copy/)).toBeNull();
	});
});
