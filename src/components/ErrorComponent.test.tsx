/**
 * @vitest-environment jsdom
 */
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ErrorComponent } from './ErrorComponent';

afterEach(() => cleanup());

const FALLBACK = 'An unexpected error occurred.';

async function renderError(error: unknown, props: { title?: string; description?: string } = {}) {
	render(
		<TestProvider>
			<ErrorComponent error={error} showReturnToHome={false} {...props} />
		</TestProvider>,
	);
	await act(() => null);
}

const httpError = (status: number) =>
	Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });

describe(ErrorComponent, () => {
	it.each([
		[403, 'Access Denied', /doesn't have permission to view this/],
		[404, 'Not Found', /couldn't find what you were looking for/],
	])('should describe a %i in words instead of the raw request failure', async (status, title, description) => {
		await renderError(httpError(status));
		expect(screen.getByTestId('error-component')).toBeTruthy();
		expect(screen.getByRole('heading', { name: title })).toBeTruthy();
		expect(screen.getByText(description)).toBeTruthy();
		expect(screen.queryByText(/Component Error/)).toBeNull();
		expect(screen.queryByText(/Request failed with status code/)).toBeNull();
	});

	it('should read a bare status as well as an axios response', async () => {
		await renderError({ status: 404, message: 'raw' });
		expect(screen.getByRole('heading', { name: 'Not Found' })).toBeTruthy();
	});

	it('should let an explicit title and description win over the status copy', async () => {
		await renderError(httpError(403), { title: 'Custom title', description: 'Custom description' });
		expect(screen.getByRole('heading', { name: 'Custom title' })).toBeTruthy();
		expect(screen.getByText('Custom description')).toBeTruthy();
		expect(screen.queryByText(/doesn't have permission/)).toBeNull();
	});

	it('should keep the raw message for a status it has no copy for', async () => {
		await renderError(httpError(500));
		expect(screen.getByRole('heading', { name: 'Component Error' })).toBeTruthy();
		expect(screen.getByText('Request failed with status code 500')).toBeTruthy();
	});

	it('should render the message of a thrown Error', async () => {
		await renderError(new Error('the cluster went away'));
		expect(screen.getByText('the cluster went away')).toBeTruthy();
	});

	it('should render the message of a plain object', async () => {
		await renderError({ message: 'not an Error instance' });
		expect(screen.getByText('not an Error instance')).toBeTruthy();
	});

	it('should render a thrown string', async () => {
		await renderError('someone threw a string');
		expect(screen.getByText('someone threw a string')).toBeTruthy();
	});

	// The boundary must not turn a handled error into a white screen. Rendering a
	// plain object as a React child throws "Objects are not valid as a React child",
	// and here that would happen *inside* the error boundary.
	it('should fall back when message is a non-renderable object', async () => {
		await renderError({ message: { code: 500 } });
		expect(screen.getByText(FALLBACK)).toBeTruthy();
	});

	it('should fall back when the thrown value is an arbitrary object', async () => {
		await renderError({ code: 500, detail: { nested: true } });
		expect(screen.getByText(FALLBACK)).toBeTruthy();
	});

	it('should fall back for an array holding a non-renderable member', async () => {
		await renderError({ message: ['fine', { bad: true }] });
		expect(screen.getByText(FALLBACK)).toBeTruthy();
	});

	// null/undefined/booleans are legal ReactNodes but render as nothing, which
	// would leave the description blank rather than explaining anything.
	it.each([
		['null', null],
		['undefined', undefined],
		['a boolean', true],
		['an empty string', ''],
	])('should fall back for %s', async (_label, error) => {
		await renderError(error);
		expect(screen.getByText(FALLBACK)).toBeTruthy();
	});

	it('should fall back for an Error with an empty message', async () => {
		await renderError(new Error(''));
		expect(screen.getByText(FALLBACK)).toBeTruthy();
	});

	it('should render a renderable array', async () => {
		await renderError({ message: ['first part ', 'second part'] });
		expect(screen.getByText('first part second part')).toBeTruthy();
	});
});
