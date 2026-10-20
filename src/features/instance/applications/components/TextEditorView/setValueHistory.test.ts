// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

// The text editor drops a model's undo history with `setValue`, even with the text the model already
// holds, and the test double in `editorPathReuse.test.tsx` is built on that. This pins it on real Monaco.
describe('Monaco model setValue', () => {
	it('drops the undo history even when the text is unchanged', async () => {
		const monaco = await import('@/lib/monaco/editorApi');
		const model = monaco.editor.createModel('A', 'plaintext', monaco.Uri.parse('file:///setValueHistory-test/a.txt'));
		model.pushEditOperations([], [{ range: model.getFullModelRange(), text: 'B' }], () => null);
		model.pushStackElement();
		expect(model.canUndo()).toBe(true);

		model.setValue('B');

		expect(model.canUndo()).toBe(false);
		expect(model.getValue()).toBe('B');
		model.dispose();
	});
});
