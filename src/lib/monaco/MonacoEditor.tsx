import type { EditorProps } from '@monaco-editor/react';
import { lazy, Suspense } from 'react';

/**
 * Lazy, self-hosted Monaco editor.
 *
 * `@/lib/monaco/setup` pulls in monaco-editor (~860 KB gzip) and points
 * `@monaco-editor/react` at the bundled instance instead of the CDN. Importing
 * it here — behind `React.lazy` rather than statically from `main.tsx` — keeps
 * Monaco out of the initial bundle; it loads the first time an editor renders.
 *
 * `setup` has side effects (`MonacoEnvironment` + `loader.config`) that must run
 * before `<Editor>` calls `loader.init()`, so we await it before resolving the
 * real component.
 *
 * Use this instead of importing `Editor` from `@monaco-editor/react` directly so
 * the bundler never links Monaco into an eager chunk. Types (`EditorProps`,
 * `OnMount`, …) are erased at build time and can still be imported directly.
 */
const LazyEditor = lazy(async () => {
	await import('@/lib/monaco/setup');
	// `@monaco-editor/react` exports the editor as its default export (its named
	// `Editor` export is not guaranteed across versions/bundler configs).
	const monacoReact = await import('@monaco-editor/react');
	return { default: monacoReact.default };
});

export function MonacoEditor(props: EditorProps) {
	return (
		<Suspense fallback={props.loading ?? null}>
			<LazyEditor {...props} />
		</Suspense>
	);
}

export default MonacoEditor;
export { MonacoEditor as Editor };
