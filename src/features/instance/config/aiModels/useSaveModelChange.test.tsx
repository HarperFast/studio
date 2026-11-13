/** @vitest-environment jsdom */
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelSaveError } from './saveModelChange';
import { useSaveModelChange } from './useSaveModelChange';

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('./saveModelChange', async (importOriginal) => ({
	...(await importOriginal<typeof import('./saveModelChange')>()),
	saveModelChange: save,
}));

const params = { instanceClient: {}, entityId: 'clu-1', entityType: 'cluster' } as
	& InstanceClientIdConfig
	& InstanceTypeConfig;
const change = { kind: 'generative', name: 'mine', entry: { backend: 'ollama', model: 'llama3.2' } } as const;
const fabricKeys = new Set(['embedding:default']);

function setup() {
	const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	const invalidate = vi.spyOn(client, 'invalidateQueries');
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	const { result } = renderHook(() => useSaveModelChange(), { wrapper });
	return { client, invalidate, result };
}

async function failWith(error: unknown) {
	save.mockRejectedValue(error);
	const { invalidate, result } = setup();
	act(() => result.current.mutate({ params, change, fabricKeys }));
	await waitFor(() => expect(result.current.isError).toBe(true));
	return invalidate;
}

let reported: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	save.mockReset();
	reported = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => reported.mockRestore());

describe('useSaveModelChange', () => {
	it('saves what the form built, to the entity the page is on, with the names Fabric manages', async () => {
		save.mockResolvedValue({ saved: 2, notRunning: 0 });
		const { client, invalidate, result } = setup();
		act(() => result.current.mutate({ params, change, fabricKeys }));
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(save).toHaveBeenCalledWith(params, change, fabricKeys);
		expect(result.current.data).toEqual({ saved: 2, notRunning: 0 });
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ['get_configuration', 'clu-1'] });
		expect(client.getMutationCache().getAll()[0].options.meta).toEqual({ skipGlobalErrorToast: true });
	});

	it('reads the settings again after a failed save, which may have changed some instances', async () => {
		const invalidate = await failWith(new ModelSaveError('Saved on 1 of 2 instances, then node-2 refused: no'));
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ['get_configuration', 'clu-1'] });
	});

	it("reports a failure Studio didn't decide on, and not its own refusals", async () => {
		await failWith(new ModelSaveError("Fabric manages the generative model 'mine', so it can't be changed here."));
		expect(reported).not.toHaveBeenCalled();

		const harper = new Error('disk full');
		await failWith(harper);
		expect(reported).toHaveBeenLastCalledWith(harper);

		reported.mockClear();
		await failWith(new ModelSaveError('Saved on 1 of 2 instances, then node-2 refused: disk full', { cause: harper }));
		expect(reported).toHaveBeenCalledTimes(1);
		expect(reported).toHaveBeenLastCalledWith(harper);
	});
});
