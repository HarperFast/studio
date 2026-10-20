import { describe, expect, it } from 'vitest';

// Node, not jsdom: a test that imports anything using useSessionStorage must not die at import time.
describe('sessionStorageStore without a DOM', () => {
	it('imports without touching window', async () => {
		await expect(import('./sessionStorageStore')).resolves.toHaveProperty('readSessionValue');
	});
});
