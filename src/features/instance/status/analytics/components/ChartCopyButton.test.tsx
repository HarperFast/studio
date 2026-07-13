// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	toBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	clipboardWrite: vi.fn(async () => undefined),
}));

vi.mock('html-to-image', () => ({ toBlob: mocks.toBlob }));
vi.mock('sonner', () => ({
	toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { AnalyticsTestWrapper } from '../tabs/__tests__/testHelpers';
import { ChartCopyButton } from './ChartCopyButton';

afterEach(() => {
	cleanup();
	mocks.toBlob.mockClear();
	mocks.toastSuccess.mockClear();
	mocks.toastError.mockClear();
	mocks.clipboardWrite.mockClear();
});

beforeEach(() => {
	// jsdom doesn't ship a clipboard or ClipboardItem; stub both onto the
	// globals so copyChartToClipboard's feature-detect passes.
	(globalThis as unknown as { ClipboardItem: typeof ClipboardItem }).ClipboardItem = class ClipboardItemStub {
		constructor(_payload: Record<string, Blob>) {}
	} as unknown as typeof ClipboardItem;
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { write: mocks.clipboardWrite },
	});
});

function Harness({ slug }: { slug: string }) {
	const ref = useRef<HTMLDivElement>(null);
	return (
		<AnalyticsTestWrapper>
			<div ref={ref}>chart</div>
			<ChartCopyButton captureRef={ref} exportSlug={slug} />
		</AnalyticsTestWrapper>
	);
}

describe('ChartCopyButton', () => {
	it('renders an accessible label and tooltip-trigger', () => {
		render(<Harness slug="cpu-usage" />);
		expect(screen.getByLabelText(/Copy cpu-usage chart to clipboard/i)).toBeTruthy();
	});

	it('captures the chart, writes to clipboard, and shows a success toast', async () => {
		render(<Harness slug="cpu-usage" />);
		fireEvent.click(screen.getByLabelText(/Copy cpu-usage chart to clipboard/i));
		await waitFor(() => expect(mocks.toBlob).toHaveBeenCalled());
		await waitFor(() => expect(mocks.clipboardWrite).toHaveBeenCalled());
		expect(mocks.toastSuccess).toHaveBeenCalledWith('Chart copied to clipboard');
	});

	it('shows an error toast when the clipboard API rejects', async () => {
		mocks.clipboardWrite.mockImplementationOnce(async () => {
			throw new Error('blocked');
		});
		render(<Harness slug="cpu-usage" />);
		fireEvent.click(screen.getByLabelText(/Copy cpu-usage chart to clipboard/i));
		await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
		expect(mocks.toastError.mock.calls[0]?.[0]).toBe('Could not copy chart');
	});

	it('reports a friendly error when the browser does not expose ClipboardItem', async () => {
		// Remove ClipboardItem to simulate Safari / non-secure-context.
		(globalThis as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem = undefined;
		render(<Harness slug="cpu-usage" />);
		fireEvent.click(screen.getByLabelText(/Copy cpu-usage chart to clipboard/i));
		await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
	});
});
