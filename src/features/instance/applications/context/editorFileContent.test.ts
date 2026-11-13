/**
 * @vitest-environment jsdom
 */
import { writeSessionValue } from '@/lib/storage/sessionStorageStore';
import { afterEach, describe, expect, it } from 'vitest';
import { editorFileContentKey, hasEditorFileContentAtOrUnder } from './editorFileContent';

const written: string[] = [];

function editBuffer(entityId: string, path: string) {
	const key = editorFileContentKey(entityId, path);
	written.push(key);
	writeSessionValue(key, undefined as string | undefined, 'edited');
}

afterEach(() => {
	for (const key of written.splice(0)) {
		writeSessionValue(key as ReturnType<typeof editorFileContentKey>, undefined as string | undefined, undefined);
	}
});

describe('hasEditorFileContentAtOrUnder', () => {
	it("finds an unsaved edit anywhere in an application's files", () => {
		editBuffer('clu-1', 'web/resources/probe.js');

		expect(hasEditorFileContentAtOrUnder('clu-1', 'web')).toBe(true);
	});

	it('ignores another application, one whose name starts the same, and another instance', () => {
		editBuffer('clu-1', 'other/index.js');
		editBuffer('clu-1', 'web-admin/index.js');
		editBuffer('clu-2', 'web/index.js');

		expect(hasEditorFileContentAtOrUnder('clu-1', 'web')).toBe(false);
	});

	it('forgets an edit once it is saved or reverted', () => {
		editBuffer('clu-1', 'web/index.js');
		writeSessionValue(editorFileContentKey('clu-1', 'web/index.js'), undefined as string | undefined, undefined);

		expect(hasEditorFileContentAtOrUnder('clu-1', 'web')).toBe(false);
	});
});
