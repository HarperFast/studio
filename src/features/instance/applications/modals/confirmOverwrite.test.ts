import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmOverwrite, OverwriteRequest, registerOverwriteConfirmHandler } from './confirmOverwrite';

afterEach(() => registerOverwriteConfirmHandler(undefined));

describe('confirmOverwrite', () => {
	it('auto-confirms when there are no collisions (nothing to ask about)', async () => {
		// No handler registered, yet an empty request resolves true so the caller proceeds.
		await expect(confirmOverwrite({ files: [], directories: [] })).resolves.toBe(true);
	});

	it('fails safe to false when collisions exist but no modal is mounted', async () => {
		await expect(confirmOverwrite({ files: ['proj/a.js'], directories: [] })).resolves.toBe(false);
	});

	it('routes a real request to the handler and resolves with the user choice', async () => {
		const seen: OverwriteRequest[] = [];
		registerOverwriteConfirmHandler((request, resolve) => {
			seen.push(request);
			resolve(true);
		});

		await expect(confirmOverwrite({ files: ['proj/a.js'], directories: ['proj/dir'] })).resolves.toBe(true);
		expect(seen).toEqual([{ files: ['proj/a.js'], directories: ['proj/dir'] }]);
	});

	it('resolves false when the handler declines', async () => {
		registerOverwriteConfirmHandler((_request, resolve) => resolve(false));
		await expect(confirmOverwrite({ files: ['proj/a.js'], directories: [] })).resolves.toBe(false);
	});

	it('does not invoke the handler for an empty request', async () => {
		const handler = vi.fn();
		registerOverwriteConfirmHandler(handler);
		await confirmOverwrite({ files: [], directories: [] });
		expect(handler).not.toHaveBeenCalled();
	});
});
