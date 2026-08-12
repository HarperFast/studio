/**
 * The Monaco API namespace, with Monaco's editor features guaranteed to be
 * registered first. **Import Monaco through this module, never from
 * `monaco-editor/editor` directly.**
 *
 * Monaco's standalone DI container snapshots its service collection exactly
 * once, the first time anything asks for a service:
 * `StandaloneServices.get()` calls a one-shot `initialize()`, which copies
 * `getSingletonServiceDescriptors()` into the collection and then never
 * re-reads it. Any `registerSingleton` that runs after that point is silently
 * dropped, and because the container is constructed in strict mode, every
 * contribution that later asks for a missing service throws
 * `[createInstance] … depends on UNKNOWN service …`.
 *
 * `monaco-editor/features/register.all` is what registers the services backing
 * code lens, inlay hints, suggest memory, the code-action widget, and tree-view
 * DnD. It is imported by `./setup`, which `MonacoEditor` loads lazily — so a
 * module that pulls in `monaco-editor/editor` on its own and touches a service
 * (`monaco.editor.createModel`, `getModels`, `onDidCreateModel`, … all call
 * `StandaloneServices.get`) can win that race and freeze an incomplete
 * collection while the setup chunk is still in flight. That poisons the DI
 * container for the rest of the session, so every editor opened afterwards —
 * on any route — throws on hover (HarperFast/studio#1614).
 *
 * Re-exporting the namespace from behind the `register.all` side-effect import
 * makes the ordering a property of the module graph: ES modules evaluate
 * imports depth-first in source order, so `register.all` has always registered
 * its singletons before any consumer of this module can run a line of code.
 */
import 'monaco-editor/features/register.all';

export * from 'monaco-editor/editor';
