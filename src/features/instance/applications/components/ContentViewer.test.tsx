/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { editor } = vi.hoisted(() => ({
	editor: {
		openedEntry: undefined as Record<string, unknown> | undefined,
		canReadFiles: true,
		granted: new Set(['add_component', 'deploy_component']),
	},
}));

vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({
	useEditorView: () => ({
		openedEntry: editor.openedEntry,
		openedEntryContents: undefined,
		canReadFiles: editor.canReadFiles,
	}),
}));
vi.mock(
	'@/features/instance/applications/lib/readMeUrlTransform',
	() => ({ useReadMeUrlTransformer: () => undefined }),
);
vi.mock('@/hooks/useInstanceOperationPermission', () => ({
	useInstanceOperationPermission: (operation: string) => editor.granted.has(operation),
}));
vi.mock('./TextEditorView', () => ({ TextEditorView: () => <div>text editor</div> }));
vi.mock('./SchemaEditorView', () => ({ SchemaEditorView: () => <div>schema editor</div> }));
vi.mock('./EnvEditorView', () => ({ EnvEditorView: () => <div>env editor</div> }));
vi.mock('./MarkupImageView', () => ({ MarkupImageView: () => null }));
const newApplicationMounts = vi.hoisted(() => ({ count: 0 }));
vi.mock('./NewApplication', async () => {
	const { useEffect } = await import('react');
	return {
		NewApplication: ({ canCreateFromTemplate, canImport }: { canCreateFromTemplate: boolean; canImport: boolean }) => {
			useEffect(() => {
				newApplicationMounts.count += 1;
			}, []);
			return <div>new application template={String(canCreateFromTemplate)} import={String(canImport)}</div>;
		},
	};
});

const { ContentViewer } = await import('./ContentViewer');
const { newApplication } = await import('./ApplicationsSidebar/specialItems');

const file = { name: 'resources.js', path: 'anvils/resources.js', project: 'anvils' };
const folderWithReadme = {
	name: 'anvils',
	path: 'anvils',
	project: 'anvils',
	entries: [],
	overviewEntry: { name: 'README.md', path: 'anvils/README.md', project: 'anvils' },
};

afterEach(cleanup);

describe('ContentViewer', () => {
	it('opens a file in the editor when the session can read files', () => {
		editor.canReadFiles = true;
		editor.openedEntry = file;
		render(<ContentViewer />);

		expect(screen.getByText('text editor')).toBeTruthy();
	});

	it('shows a read-only placeholder instead of a file or README the session cannot read', () => {
		editor.canReadFiles = false;
		for (const entry of [file, folderWithReadme]) {
			editor.openedEntry = entry;
			render(<ContentViewer />);
			expect(screen.getByText(/can list applications but not open their files/)).toBeTruthy();
			expect(screen.queryByText('text editor')).toBeNull();
			cleanup();
		}
	});

	it('offers New Application only to a session that can create or deploy one', () => {
		editor.canReadFiles = false;
		editor.openedEntry = { name: 'New Application', path: newApplication, project: '' };
		editor.granted = new Set();
		render(<ContentViewer />);
		expect(screen.getByText('This connection cannot create applications.')).toBeTruthy();
		editor.granted = new Set(['add_component', 'deploy_component']);
	});

	it.each([
		['add_component', 'new application template=true import=false'],
		['deploy_component', 'new application template=false import=true'],
	])('offers only the creation method %s allows', (operation, rendered) => {
		editor.openedEntry = { name: 'New Application', path: newApplication, project: '' };
		editor.granted = new Set([operation]);
		render(<ContentViewer />);
		expect(screen.getByText(rendered)).toBeTruthy();
		editor.granted = new Set(['add_component', 'deploy_component']);
	});

	it('starts New Application afresh when the creation methods it may offer change', () => {
		editor.openedEntry = { name: 'New Application', path: newApplication, project: '' };
		editor.granted = new Set(['add_component']);
		newApplicationMounts.count = 0;
		const { rerender } = render(<ContentViewer />);

		editor.granted = new Set(['deploy_component']);
		rerender(<ContentViewer />);

		expect(newApplicationMounts.count).toBe(2);
		editor.granted = new Set(['add_component', 'deploy_component']);
	});
});
