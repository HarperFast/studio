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

async function renderError(error: unknown) {
	render(
		<TestProvider>
			<ErrorComponent error={error} showReturnToHome={false} />
		</TestProvider>,
	);
	await act(() => null);
}

describe(ErrorComponent, () => {
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
