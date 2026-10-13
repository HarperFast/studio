/** @vitest-environment jsdom */
import { editorFileContentKey } from '@/features/instance/applications/context/editorFileContent';
import { dropComponent } from '@/integrations/api/instance/applications/dropComponent';
import { clearSessionStorage } from '@/lib/storage/clearSessionStorage';
import { readSessionValue } from '@/lib/storage/sessionStorageStore';
import { queryClient } from '@/react-query/queryClient';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecuteParams } from '../../types/executeParams';
import { execute } from './execute';

vi.mock('@/integrations/api/instance/applications/dropComponent', () => ({ dropComponent: vi.fn() }));

const instanceClientParams = { entityType: 'instance', entityId: 'ins-1' } as ExecuteParams['instanceClientParams'];
const bufferKey = editorFileContentKey('ins-1', 'app/lib/a.js');
const contentsKey = ['ins-1', 'get_component_file', 'app', 'lib/a.js', undefined];

function drop(path: string) {
	return execute({ input: { path }, instanceClientParams, baseURL: null, params: {} });
}

beforeEach(() => {
	sessionStorage.setItem(bufferKey, JSON.stringify('unsaved edits'));
	queryClient.setQueryData(contentsKey, { message: 'saved' });
});

afterEach(() => {
	clearSessionStorage();
	queryClient.clear();
	vi.clearAllMocks();
});

describe("the assistant's dropComponentFile tool", () => {
	it('forgets the unsaved edits and loaded contents of what it deleted', async () => {
		vi.mocked(dropComponent).mockResolvedValue({ message: 'Successfully dropped' });

		await expect(drop('app/lib/')).resolves.toMatchObject({ success: true });

		expect(readSessionValue(bufferKey, undefined)).toBeUndefined();
		expect(queryClient.getQueryData(contentsKey)).toBeUndefined();
	});

	it('keeps them when the drop failed, since the file may still be there', async () => {
		vi.mocked(dropComponent).mockRejectedValue(new Error('timeout of 60000ms exceeded'));

		await expect(drop('app/lib/a.js')).resolves.toMatchObject({ success: false });

		expect(readSessionValue(bufferKey, undefined)).toBe('unsaved edits');
		expect(queryClient.getQueryData(contentsKey)).toBeDefined();
	});
});
