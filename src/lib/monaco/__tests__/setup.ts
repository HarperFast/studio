// jsdom polyfill so monaco-editor can be imported under the test runner.
//
// As of monaco-editor 0.55 the language-service singletons live on the
// per-language `register` entry points (see `../languageServices`), so importing
// the Harper language helpers now eagerly evaluates monaco. Monaco's clipboard
// contribution probes `document.queryCommandSupported('paste')` at module-eval
// time, and jsdom does not implement the (deprecated) `queryCommand*` API — so
// the import throws before any test runs. Real browsers provide these methods.
//
// Guarded on `document` because the default test environment is `node`; only
// the jsdom-environment suites have a `document` to patch.

if (typeof document !== 'undefined') {
	if (typeof document.queryCommandSupported !== 'function') {
		document.queryCommandSupported = () => false;
	}
	if (typeof document.execCommand !== 'function') {
		document.execCommand = () => false;
	}
}
