/** @vitest-environment jsdom */
import { ExtensionIcon } from '@/features/instance/extensions/ExtensionIcon';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
	cleanup();
	vi.doUnmock('lucide-react/dynamic');
});

function iconClass(container: HTMLElement) {
	return container.querySelector('svg')?.getAttribute('class') ?? '';
}

// The icon map loads once per module, so a case that watches it load needs a copy that hasn't loaded it yet.
async function freshExtensionIcon(onIconMapLoad: () => void) {
	vi.resetModules();
	vi.doMock('lucide-react/dynamic', (importOriginal) => {
		onIconMapLoad();
		return importOriginal();
	});
	return (await import('@/features/instance/extensions/ExtensionIcon')).ExtensionIcon;
}

describe('ExtensionIcon', () => {
	it("loads Lucide's icon map only once a named icon is drawn", async () => {
		let loads = 0;
		const FreshIcon = await freshExtensionIcon(() => {
			loads += 1;
		});
		render(<FreshIcon name={undefined} className="size-4" />);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(loads).toBe(0);
		const { container } = render(<FreshIcon name="activity" className="size-4" />);
		await waitFor(() => expect(iconClass(container)).toContain('lucide-activity'));
		expect(loads).toBe(1);
	});

	it('draws a puzzle piece, without waiting, when no icon is named', () => {
		const { container } = render(<ExtensionIcon name={undefined} className="size-4" />);
		expect(iconClass(container)).toContain('lucide-puzzle');
	});

	it("draws a puzzle piece for a name Lucide doesn't have", async () => {
		const { container } = render(<ExtensionIcon name="not-a-lucide-icon" className="size-4" />);
		await waitFor(() => expect(iconClass(container)).toContain('lucide-puzzle'));
		expect(iconClass(container)).toContain('size-4');
	});

	it('draws the named icon with its classes', async () => {
		const { container } = render(<ExtensionIcon name="layers" className="size-5 text-primary" />);
		await waitFor(() => expect(iconClass(container)).toContain('lucide-layers'));
		expect(iconClass(container)).toContain('text-primary');
	});

	it("draws a puzzle piece when the icon map's chunk fails to load", async () => {
		const FreshIcon = await freshExtensionIcon(() => {
			throw new TypeError('Failed to fetch dynamically imported module');
		});
		const { container } = render(<FreshIcon name="activity" className="size-4" />);
		await waitFor(() => expect(iconClass(container)).toContain('lucide-puzzle'));
	});
});
