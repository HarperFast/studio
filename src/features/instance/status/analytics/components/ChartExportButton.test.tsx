// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above imports; bind their stubs via
// vi.hoisted so we can still reference them in test assertions.
const mocks = vi.hoisted(() => ({
	toBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock('html-to-image', () => ({ toBlob: mocks.toBlob }));
vi.mock('sonner', () => ({
	toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { AnalyticsTestWrapper } from '../tabs/__tests__/testHelpers';
import { ChartExportButton } from './ChartExportButton';

afterEach(() => {
	cleanup();
	mocks.toBlob.mockClear();
	mocks.toastSuccess.mockClear();
	mocks.toastError.mockClear();
});

function Harness({ slug }: { slug: string }) {
	const ref = useRef<HTMLDivElement>(null);
	return (
		<AnalyticsTestWrapper>
			<div ref={ref} data-testid="capture-target">chart</div>
			<ChartExportButton captureRef={ref} exportSlug={slug} />
		</AnalyticsTestWrapper>
	);
}

describe('ChartExportButton', () => {
	it('renders an accessible label and tooltip-trigger', () => {
		render(<Harness slug="cpu-usage" />);
		expect(screen.getByLabelText(/Download cpu-usage as PNG/i)).toBeTruthy();
	});

	it('captures the referenced node and shows a success toast on click', async () => {
		// jsdom's URL.createObjectURL doesn't exist by default.
		const origCreate = URL.createObjectURL;
		const origRevoke = URL.revokeObjectURL;
		URL.createObjectURL = vi.fn(() => 'blob:mock');
		URL.revokeObjectURL = vi.fn();
		try {
			render(<Harness slug="cpu-usage" />);
			fireEvent.click(screen.getByLabelText(/Download cpu-usage as PNG/i));
			await waitFor(() => expect(mocks.toBlob).toHaveBeenCalled());
			await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
			const message = mocks.toastSuccess.mock.calls[0]?.[0] as string;
			expect(message).toMatch(/^Saved cpu-usage-/);
			expect(message).toMatch(/\.png$/);
		} finally {
			URL.createObjectURL = origCreate;
			URL.revokeObjectURL = origRevoke;
		}
	});

	it('shows an error toast when the capture throws', async () => {
		mocks.toBlob.mockImplementationOnce(async () => null as unknown as Blob);
		render(<Harness slug="cpu-usage" />);
		fireEvent.click(screen.getByLabelText(/Download cpu-usage as PNG/i));
		await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
		expect(mocks.toastError.mock.calls[0]?.[0]).toBe('Could not export chart');
	});
});
