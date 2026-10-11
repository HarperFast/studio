/** @vitest-environment jsdom */
import { dropComponent } from '@/integrations/api/instance/applications/dropComponent';
import { OUTCOME_UNKNOWN_TITLE, UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';
import { renderHook } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRenameFiles } from './useRenameFiles';

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'ins-1', entityType: 'instance' }),
}));
vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({
	useEditorView: () => ({ reloadRootEntries: vi.fn(), setFocusedItem: vi.fn(), setSelectedItems: vi.fn() }),
}));
vi.mock('@/integrations/api/instance/applications/getComponentFile', () => ({
	getComponentFile: vi.fn().mockResolvedValue({ message: 'Y29udGVudHM=' }),
}));
vi.mock('@/integrations/api/instance/applications/setComponentFile', () => ({
	setComponentFile: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/integrations/api/instance/applications/dropComponent', () => ({ dropComponent: vi.fn() }));
vi.mock('sonner', () => ({ toast: { loading: vi.fn(() => 'rename-toast'), error: vi.fn(), success: vi.fn() } }));

const dropSent = {
	method: 'post',
	data: JSON.stringify({ operation: 'drop_component' }),
} as InternalAxiosRequestConfig;

function rename() {
	const { result } = renderHook(() => useRenameFiles());
	return result.current([{ from: 'app/old.js', to: 'app/new.js' }]);
}

describe('useRenameFiles', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('says a rename whose last write got no answer may have gone through', async () => {
		vi.mocked(dropComponent).mockRejectedValue(
			new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED, dropSent),
		);

		await expect(rename()).resolves.toBe(false);

		expect(toast.error).toHaveBeenCalledWith(
			OUTCOME_UNKNOWN_TITLE,
			expect.objectContaining({ id: 'rename-toast', description: UNANSWERED_WRITE_MESSAGE }),
		);
	});

	it('still says a refused rename failed', async () => {
		vi.mocked(dropComponent).mockRejectedValue(new Error('Unable to locate project'));

		await expect(rename()).resolves.toBe(false);

		expect(toast.error).toHaveBeenCalledWith(
			'Rename Failed',
			expect.objectContaining({ id: 'rename-toast', description: 'Unable to locate project' }),
		);
	});
});
