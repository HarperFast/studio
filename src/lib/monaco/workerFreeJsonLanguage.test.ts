import { describe, expect, it, vi } from 'vitest';
import type { WorkerFreeJsonMonaco } from './workerFreeJsonLanguage';

// Stub Monaco's JSON tokenizer so the test doesn't pull in the editor runtime;
// we only care that it is handed to `setTokensProvider`.
const tokensProvider = { getInitialState: () => null, tokenize: () => ({ tokens: [], endState: null }) };
vi.mock('monaco-editor/esm/vs/language/json/tokenization.js', () => ({
	createTokenizationSupport: () => tokensProvider,
}));

function makeFakeLanguages() {
	return {
		register: vi.fn(),
		setLanguageConfiguration: vi.fn(),
		setTokensProvider: vi.fn(),
		// Worker-backed providers — registering ANY of these for the record editor
		// language would reintroduce the OOM the language exists to avoid.
		registerCompletionItemProvider: vi.fn(),
		registerHoverProvider: vi.fn(),
		registerFoldingRangeProvider: vi.fn(),
		registerColorProvider: vi.fn(),
		registerDocumentFormattingEditProvider: vi.fn(),
		registerDocumentRangeFormattingEditProvider: vi.fn(),
		registerDocumentSymbolProvider: vi.fn(),
		registerSelectionRangeProvider: vi.fn(),
	};
}

describe('registerWorkerFreeJsonLanguage', () => {
	it('registers highlighting + language configuration but no worker-backed providers', async () => {
		vi.resetModules();
		const { registerWorkerFreeJsonLanguage, WORKER_FREE_JSON_LANGUAGE_ID } = await import('./workerFreeJsonLanguage');
		const languages = makeFakeLanguages();

		registerWorkerFreeJsonLanguage(languages as unknown as WorkerFreeJsonMonaco);

		expect(languages.register).toHaveBeenCalledWith({ id: WORKER_FREE_JSON_LANGUAGE_ID });
		expect(languages.setTokensProvider).toHaveBeenCalledWith(WORKER_FREE_JSON_LANGUAGE_ID, tokensProvider);
		expect(languages.setLanguageConfiguration).toHaveBeenCalledWith(
			WORKER_FREE_JSON_LANGUAGE_ID,
			expect.objectContaining({ brackets: expect.any(Array), autoClosingPairs: expect.any(Array) }),
		);

		// The whole point of the language: no language worker is ever wired up.
		expect(languages.registerCompletionItemProvider).not.toHaveBeenCalled();
		expect(languages.registerHoverProvider).not.toHaveBeenCalled();
		expect(languages.registerFoldingRangeProvider).not.toHaveBeenCalled();
		expect(languages.registerColorProvider).not.toHaveBeenCalled();
		expect(languages.registerDocumentFormattingEditProvider).not.toHaveBeenCalled();
		expect(languages.registerDocumentRangeFormattingEditProvider).not.toHaveBeenCalled();
		expect(languages.registerDocumentSymbolProvider).not.toHaveBeenCalled();
		expect(languages.registerSelectionRangeProvider).not.toHaveBeenCalled();
	});

	it('registers once, even if called repeatedly (HMR / repeated setup imports)', async () => {
		vi.resetModules();
		const { registerWorkerFreeJsonLanguage } = await import('./workerFreeJsonLanguage');
		const languages = makeFakeLanguages();

		registerWorkerFreeJsonLanguage(languages as unknown as WorkerFreeJsonMonaco);
		registerWorkerFreeJsonLanguage(languages as unknown as WorkerFreeJsonMonaco);

		expect(languages.register).toHaveBeenCalledTimes(1);
		expect(languages.setTokensProvider).toHaveBeenCalledTimes(1);
	});
});
