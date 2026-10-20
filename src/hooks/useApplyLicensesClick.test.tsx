/**
 * @vitest-environment jsdom
 */
import type { SchemaLicense } from '@/integrations/api/api.gen';
import { OUTCOME_UNKNOWN_TITLE } from '@/integrations/api/unansweredWrite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = { target: 'ins-a' };
	const params = { entityType: 'instance', entityId: 'ins-a', instanceClient };
	return {
		useInstanceClient: () => instanceClient,
		useInstanceClientIdParams: () => params,
	};
});
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo: vi.fn() }));
vi.mock('@/integrations/api/instance/auth/installUsageLicense', () => ({ installUsageLicense: vi.fn() }));
vi.mock('@/lib/sleep', () => ({ sleep: vi.fn(() => Promise.resolve()) }));
vi.mock('sonner', () => ({
	toast: { loading: vi.fn(() => 'toast-1'), error: vi.fn(), success: vi.fn(), dismiss: vi.fn() },
}));

import { installUsageLicense } from '@/integrations/api/instance/auth/installUsageLicense';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { toast } from 'sonner';
import { useApplyLicensesClick } from './useApplyLicensesClick';

const LICENSES = [{ license: 'lic-1' }, { license: 'lic-2' }] as SchemaLicense[];
const installSent = { method: 'post', data: '{"operation":"install_usage_license"}' } as InternalAxiosRequestConfig;

function wrapper() {
	const queryClient = new QueryClient();
	return ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}
	</QueryClientProvider>;
}

async function applyLicenses(licenses = LICENSES) {
	const { result } = renderHook(() => useApplyLicensesClick({ licenses }), { wrapper: wrapper() });
	await act(async () => {
		await (result.current.onApplyLicensesClick() as unknown as Promise<void>);
	});
	return result;
}

beforeEach(() => {
	vi.mocked(getInstanceUserInfo).mockResolvedValue({} as never);
	vi.mocked(installUsageLicense).mockResolvedValue({ message: 'ok' } as never);
});

afterEach(() => vi.clearAllMocks());

describe('useApplyLicensesClick', () => {
	it('installs every license and reports success', async () => {
		const result = await applyLicenses();

		expect(vi.mocked(installUsageLicense).mock.calls.map(([body]) => body.license)).toEqual(['lic-1', 'lic-2']);
		expect(result.current.isApplyLicensesPending).toBe(false);
		expect(toast.success).toHaveBeenCalled();
	});

	it('does not install a license when Cancel is clicked while the instance is being checked', async () => {
		vi.mocked(getInstanceUserInfo).mockImplementation(async () => {
			cancel();
			return {} as never;
		});

		await applyLicenses();

		expect(installUsageLicense).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledWith('Cancelled', expect.anything());
	});

	it('counts a license that got no answer apart from one that failed', async () => {
		vi.mocked(installUsageLicense)
			.mockResolvedValueOnce({} as never)
			.mockRejectedValueOnce(new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED, installSent));

		await applyLicenses();

		const [title, options] = vi.mocked(toast.error).mock.calls.at(-1)!;
		expect(title).toBe(OUTCOME_UNKNOWN_TITLE);
		expect(options?.description).toBe(
			"1 of 2 licenses confirmed applied. 1 request couldn't be confirmed, so it may have gone through. "
				+ 'Check before you try again, or it may run twice.',
		);
	});

	it('still counts a refused license when another got no answer', async () => {
		vi.mocked(installUsageLicense)
			.mockResolvedValueOnce({} as never)
			.mockRejectedValueOnce(new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED, installSent))
			.mockRejectedValueOnce(new Error('License is expired'));

		await applyLicenses([...LICENSES, { license: 'lic-3' }] as SchemaLicense[]);

		const [title, options] = vi.mocked(toast.error).mock.calls.at(-1)!;
		expect(title).toBe(OUTCOME_UNKNOWN_TITLE);
		expect(options?.description).toBe(
			"1 of 3 licenses confirmed applied. 1 request couldn't be confirmed, so it may have gone through. "
				+ 'Check before you try again, or it may run twice. 1 other license failed to apply.',
		);
	});

	it('still says a refused license was not applied', async () => {
		vi.mocked(installUsageLicense)
			.mockResolvedValueOnce({} as never)
			.mockRejectedValueOnce(new Error('License is expired'));

		await applyLicenses();

		const [title, options] = vi.mocked(toast.error).mock.calls.at(-1)!;
		expect(title).toBe('Error');
		expect(options?.description).toBe('Licenses not applied.\n1 of 2 licenses applied.');
	});
});

function cancel() {
	const [, options] = vi.mocked(toast.loading).mock.calls.at(-1)!;
	(options as unknown as { action: { onClick: () => void } }).action.onClick();
}
