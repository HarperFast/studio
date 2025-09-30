/**
 * @vitest-environment jsdom
 */
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { OrgCard } from './OrgCard';

// TODO: This isn't working, at least not with TypeScript safely.
// import * as matchers from '@testing-library/jest-dom/matchers';
// expect.extend(matchers);

afterEach(() => cleanup);

describe('Org Card', () => {
	it('should render', async () => {
		const onDeleteOrgModal = () => undefined;
		render(<TestProvider>
			<OrgCard
				organizationRole={{
					organizationId: '123',
					organizationName: 'Acme',
					roleName: 'Developer',
				}}
				onDeleteOrgModal={onDeleteOrgModal}
			/>
		</TestProvider>);
		await act(() => null);

		// screen.debug();
		expect(screen.getByText(/^Acme/).textContent).toBeTruthy();
		const link = screen.getByTitle('View Acme');
		expect(link).toBeTruthy();
		const href = link.getAttribute('href');
		expect(href).toBe('/#/123');
	});
});
