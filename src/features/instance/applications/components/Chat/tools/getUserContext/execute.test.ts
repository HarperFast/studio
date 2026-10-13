/** @vitest-environment jsdom */
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { clearSessionStorage } from '@/lib/storage/clearSessionStorage';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExecuteParams } from '../../types/executeParams';
import { execute } from './execute';

const params = {
	instanceClientParams: { entityId: 'instance-1' },
	params: {},
} as unknown as ExecuteParams;

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	clearSessionStorage();
});

describe('getUserContext', () => {
	it('reports the file the editor shows even when sessionStorage refused to store it', async () => {
		const { result } = renderHook(() =>
			useSessionStorage('FileFocused/instance-1' as 'FileFocused/{entityId}', 'app' as string | undefined)
		);
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
		});
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		act(() => result.current[1]('app/resources.js'));

		const context = await execute(params);

		expect(context).toMatchObject({ data: { openedPath: 'app/resources.js' } });
	});
});
