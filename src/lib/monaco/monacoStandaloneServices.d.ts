/**
 * Monaco's standalone DI container. Not one of monaco-editor's declared entry
 * points, so it ships without type declarations.
 *
 * `editorApi.test.ts` reaches in to assert *which* services the container
 * actually committed to — see `editorApi.ts` for why that set depends on
 * evaluation order. `initialize` is the one-shot that snapshots the singleton
 * registry; calling it again returns the existing `InstantiationService`, whose
 * internal service collection is the only place the committed set is
 * observable. Typed as loosely as the assertion needs, since these are
 * Monaco-internal shapes with no compatibility promise.
 */
declare module 'monaco-editor/editor/standalone/browser/standaloneServices.js' {
	export const StandaloneServices: {
		initialize(overrides: object): { _services?: { _entries?: Map<unknown, unknown> } };
	};
}
