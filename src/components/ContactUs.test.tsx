/**
 * @vitest-environment jsdom
 */
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContactUs } from './ContactUs';

afterEach(() => cleanup);

describe(ContactUs, () => {
	it('should render a Discord link', async () => {
		render(<TestProvider>
			<ContactUs />
		</TestProvider>);

		await act(() => null);

		const link = screen.getByText('Contact us');
		expect(link).toBeTruthy();
		const href = link.getAttribute('href');
		expect(href).toEqual(expect.stringContaining('discord.com'));
	});

	it('should render an email link', async () => {
		render(<TestProvider>
			<ContactUs overEmail={true} />
		</TestProvider>);

		await act(() => null);

		const link = screen.getByText('Contact us');
		expect(link).toBeTruthy();
		const href = link.getAttribute('href');
		expect(href).toEqual(expect.stringContaining('mailto:'));
	});
});
