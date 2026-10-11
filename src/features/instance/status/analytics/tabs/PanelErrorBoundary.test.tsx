/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelErrorBoundary } from './PanelErrorBoundary';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function Broken(): never {
	throw new Error('bad records');
}

describe('PanelErrorBoundary', () => {
	it('logs a panel crash as a warning, leaving the RUM report to the root error handler', () => {
		const consoleError = vi.spyOn(console, 'error');
		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		render(
			<PanelErrorBoundary metric="cpu">
				<Broken />
			</PanelErrorBoundary>,
			{ onCaughtError: () => {} },
		);

		expect(screen.getByText('Panel "cpu" is unavailable')).toBeTruthy();
		expect(consoleWarn).toHaveBeenCalledWith('[panel:cpu] render failed', expect.any(Error));
		expect(consoleError.mock.calls.filter(([first]) => String(first).includes('render failed'))).toEqual([]);
	});
});
