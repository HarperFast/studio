/**
 * @vitest-environment jsdom
 */
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkupImageView } from './index';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>';

const openedEntry: FileEntry = { name: 'logo.svg', path: 'myapp/logo.svg', project: 'myapp' };

// Mutable so individual tests can steer what the editor context exposes, without
// re-hoisting a fresh mock per case.
let editorView: { openedEntry: FileEntry | undefined; openedEntryContents: string | undefined } = {
	openedEntry,
	openedEntryContents: SVG,
};
let bufferedEdit: string | undefined;

vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({
	useEditorView: () => editorView,
}));

// The preview reads unsaved edits from this buffer; the source editor writes them.
vi.mock('@/features/instance/applications/context/editorFileContent', () => ({
	useEditorFileContent: () => ({ content: bufferedEdit, setContent: vi.fn() }),
}));

// The source escape hatch mounts Monaco; a marker div is enough to assert the handoff.
vi.mock('@/features/instance/applications/components/TextEditorView', () => ({
	TextEditorView: () => <div data-testid="source-editor" />,
}));

afterEach(() => {
	cleanup();
	editorView = { openedEntry, openedEntryContents: SVG };
	bufferedEdit = undefined;
	vi.clearAllMocks();
});

function renderView() {
	return render(<MarkupImageView media={{ mime: 'image/svg+xml' }} />);
}

describe('MarkupImageView', () => {
	it('previews the SVG as an <img> data URL by default', () => {
		renderView();
		const img = screen.getByRole('img') as HTMLImageElement;
		expect(img.getAttribute('src')).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`);
		expect(img.getAttribute('alt')).toBe('logo.svg');
		expect(screen.queryByTestId('source-editor')).toBeNull();
	});

	it('drops down to the source editor and flips back to the preview', () => {
		renderView();

		fireEvent.click(screen.getByRole('button', { name: /edit as text/i }));
		expect(screen.getByTestId('source-editor')).toBeTruthy();
		expect(screen.queryByRole('img')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: /preview/i }));
		expect(screen.getByRole('img')).toBeTruthy();
		expect(screen.queryByTestId('source-editor')).toBeNull();
	});

	it('previews unsaved edits from the source buffer before they are saved', () => {
		const edited = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5" /></svg>';
		bufferedEdit = edited;
		renderView();

		const img = screen.getByRole('img') as HTMLImageElement;
		expect(img.getAttribute('src')).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(edited)}`);
	});

	it('shows an actionable hint (and keeps the escape hatch) when the markup fails to render', () => {
		renderView();

		fireEvent.error(screen.getByRole('img'));
		expect(screen.queryByRole('img')).toBeNull();
		expect(screen.getByText(/couldn.t be rendered/i)).toBeTruthy();
		expect(screen.getByRole('button', { name: /edit as text/i })).toBeTruthy();
	});

	it('retries the render once the failing markup is edited', () => {
		const { rerender } = renderView();

		// The current markup fails to render → hint, no image.
		fireEvent.error(screen.getByRole('img'));
		expect(screen.queryByRole('img')).toBeNull();

		// Editing it (a different source) clears the failure and re-attempts the preview.
		bufferedEdit = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5" /></svg>';
		rerender(<MarkupImageView media={{ mime: 'image/svg+xml' }} />);
		expect(screen.getByRole('img')).toBeTruthy();
	});
});
