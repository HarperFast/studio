/** @vitest-environment jsdom */
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/useEntityRestURL', () => ({ useEntityRestURL: () => '' }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'instance-1', entityType: 'instance' }),
}));
vi.mock('@/features/instance/applications/context/editorFileContent', () => ({
	useEditorFileContent: () => ({ setContent: vi.fn() }),
}));
vi.mock('@/hooks/useSessionStorage', async () => {
	const { useState } = await import('react');
	return { useSessionStorage: (_key: string, initialValue: unknown) => useState(initialValue) };
});
vi.mock('@/integrations/api/instance/applications/setComponentFile', () => ({
	useSetComponentFile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/events/listener', () => ({ useListener: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
	queryOptions: (options: unknown) => options,
	useQuery: () => ({ data: undefined }),
	useQueryClient: () => ({ fetchQuery: vi.fn(), setQueryData: vi.fn() }),
}));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => vi.fn(),
	useSearch: () => ({}),
}));

import { EditorViewProvider } from './EditorViewProvider';

const protectedRoot: DirectoryEntry = {
	name: 'status-check',
	path: 'status-check',
	project: 'status-check',
	package: '@harperdb/akamai-status@1.0.0',
	entries: [],
};

function ProtectionProbe() {
	const { restrictPackageModification, setOpenedEntry } = useEditorView();
	return (
		<>
			<output data-testid="restricted">{String(restrictPackageModification)}</output>
			<button type="button" onClick={() => setOpenedEntry(protectedRoot)}>Open protected component</button>
		</>
	);
}

describe('EditorViewProvider', () => {
	it('marks a protected opened entry as read-only', () => {
		render(
			<EditorViewProvider>
				<ProtectionProbe />
			</EditorViewProvider>,
		);

		expect(screen.getByTestId('restricted').textContent).toBe('false');
		fireEvent.click(screen.getByRole('button', { name: 'Open protected component' }));
		expect(screen.getByTestId('restricted').textContent).toBe('true');
	});
});
