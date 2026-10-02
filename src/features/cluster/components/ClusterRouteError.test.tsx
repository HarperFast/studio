/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-1' }),
	Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@/components/ErrorComponent', () => ({
	ErrorComponent: ({ error }: { error: Error }) => <p>generic error: {error.message}</p>,
}));

import { ClusterRouteError } from './ClusterRouteError';

afterEach(() => {
	cleanup();
});

const httpError = (status: number) =>
	Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });

describe('ClusterRouteError', () => {
	it('explains a 403 as setup an org admin has yet to finish, with a way back to the clusters', () => {
		render(<ClusterRouteError error={httpError(403)} />);
		expect(screen.getByRole('heading', { name: 'Pending Owner Setup' })).toBeTruthy();
		expect(screen.getByRole('link', { name: /Back to clusters/ }).getAttribute('href')).toBe('/org-1');
		expect(screen.queryByText(/generic error/)).toBeNull();
	});

	it('leaves every other failure to the generic error page', () => {
		render(<ClusterRouteError error={httpError(500)} />);
		expect(screen.getByText('generic error: Request failed with status code 500')).toBeTruthy();
		expect(screen.queryByText('Pending Owner Setup')).toBeNull();
	});
});
