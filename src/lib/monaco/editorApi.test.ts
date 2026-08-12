// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

/**
 * The services `monaco-editor/features/register.all` contributes. They are the
 * ones that showed up as `[createInstance] … depends on UNKNOWN service …` in
 * production when an editor-feature registration lost the race against the
 * first service lookup (HarperFast/studio#1614).
 */
const REGISTER_ALL_SERVICES = [
	'actionWidgetService',
	'ICodeLensCache',
	'IInlayHintsCache',
	'ISuggestMemories',
	'treeViewsDndService',
];

/**
 * Read the service ids Monaco's standalone DI container actually committed to.
 * `initialize()` is the one-shot that snapshots the singleton registry; calling
 * it again returns the existing container, so this observes the real collection
 * rather than building a fresh one.
 */
async function committedServiceIds(): Promise<string[]> {
	const { StandaloneServices } = await import('monaco-editor/editor/standalone/browser/standaloneServices.js');
	const entries = StandaloneServices.initialize({})._services?._entries;
	return entries ? [...entries.keys()].map(String) : [];
}

describe('monaco editorApi', () => {
	// One test per file: the DI container snapshots once per module registry, so
	// a second case in this file would observe the first case's container.
	it('registers the editor features before a service lookup can freeze the collection', async () => {
		const monaco = await import('./editorApi');

		// Touching a service is what triggers the one-shot snapshot. This is the
		// call `useApplicationTypeIntelligence` makes from an effect, which used
		// to run while the lazy `./setup` chunk (and its `register.all`) was
		// still loading behind `<MonacoEditor>`'s Suspense boundary.
		const model = monaco.editor.createModel('{}', 'json', monaco.Uri.parse('file:///editorApi-test/a.json'));

		// Released even if the assertion throws: Monaco's model registry is
		// module state, so a leaked model would collide on its URI if this file
		// re-ran in the same worker (watch mode).
		try {
			expect(await committedServiceIds()).toEqual(expect.arrayContaining(REGISTER_ALL_SERVICES));
		} finally {
			model.dispose();
		}
		// Evaluating Monaco's editor + every feature registration is seconds of
		// work, well past the 5s default once the suite runs them in parallel.
	}, 30_000);
});
