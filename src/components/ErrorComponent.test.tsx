/**
 * @vitest-environment jsdom
 */
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorComponent } from './ErrorComponent';

const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn(() => Promise.resolve()) }));
// Only ErrorComponent's own import is replaced; the provider's router and its links stay real.
vi.mock('@tanstack/react-router', async (importOriginal) => {
	const router = { invalidate };
	return { ...await importOriginal<typeof import('@tanstack/react-router')>(), useRouter: () => router };
});

afterEach(() => {
	cleanup();
	invalidate.mockClear();
});

const FALLBACK = 'An unexpected error occurred.';

async function renderError(
	error: unknown,
	props: { title?: string; description?: string; reset?: () => void } = {},
) {
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

	it('should fall back rather than throw for a value whose properties throw when read', async () => {
		const hostile = new Proxy({}, {
			get() {
				throw new Error('getter trap');
			},
			has() {
				throw new Error('has trap');
			},
		});
		await renderError(hostile);
		expect(screen.getByRole('heading', { name: 'Something Went Wrong' })).toBeTruthy();
		expect(screen.getByText(FALLBACK)).toBeTruthy();
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

	it('should keep the raw message under a generic title for a status it has no copy for', async () => {
		await renderError(httpError(409));
		expect(screen.getByRole('heading', { name: 'Something Went Wrong' })).toBeTruthy();
		expect(screen.getByText('Request failed with status code 409')).toBeTruthy();
	});

	const networkError = (code: string) => Object.assign(new Error('Network Error'), { code });
	const reset = () => {};

	it.each([
		['a 500', httpError(500), 'Something Went Wrong', /couldn't load this \(error 500\)/],
		['a 503', httpError(503), 'Something Went Wrong', /couldn't load this \(error 503\)/],
		['ERR_NETWORK', networkError('ERR_NETWORK'), "Couldn't Reach the Server", /didn't get an answer/],
		['ECONNABORTED', networkError('ECONNABORTED'), "Couldn't Reach the Server", /didn't get an answer/],
		['ETIMEDOUT', networkError('ETIMEDOUT'), "Couldn't Reach the Server", /didn't get an answer/],
	])('should offer Try Again on a route for %s', async (_label, error, title, description) => {
		await renderError(error, { reset });
		expect(screen.getByRole('heading', { name: title })).toBeTruthy();
		expect(screen.getByText(description)).toBeTruthy();
		expect(screen.getByRole('button', { name: /Try Again/ })).toBeTruthy();
	});

	it.each([
		['a 400', httpError(400)],
		['a 403', httpError(403)],
		['a 404', httpError(404)],
		['a cancellation', networkError('ERR_CANCELED')],
		['a thrown TypeError', new TypeError('x is undefined')],
		['a thrown string', 'boom'],
	])('should not offer Try Again for %s, which a reload cannot fix', async (_label, error) => {
		await renderError(error, { reset });
		expect(screen.queryByRole('button', { name: /Try Again/ })).toBeNull();
	});

	it('should not offer Try Again outside a route error boundary', async () => {
		await renderError(httpError(503));
		expect(screen.getByText(/couldn't load this \(error 503\)/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Try Again/ })).toBeNull();
	});

	it('should reload the route once per Try Again, and not again while that reload is pending', async () => {
		let finishReload!: () => void;
		invalidate.mockImplementationOnce(() => new Promise<void>((resolve) => (finishReload = resolve)));
		await renderError(httpError(503), { reset });
		const button = screen.getByRole('button', { name: /Try Again/ });

		fireEvent.click(button);
		fireEvent.click(button);
		expect(invalidate).toHaveBeenCalledTimes(1);
		const pending = screen.getByRole<HTMLButtonElement>('button', { name: /Trying Again/ });
		expect(pending.disabled).toBe(true);
		expect(pending.querySelector('svg')?.classList.contains('animate-spin')).toBe(true);

		await act(async () => finishReload());
		const settled = screen.getByRole<HTMLButtonElement>('button', { name: /Try Again/ });
		expect(settled.disabled).toBe(false);
		expect(settled.querySelector('svg')?.classList.contains('animate-spin')).toBe(false);
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
