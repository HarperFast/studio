/**
 * @vitest-environment jsdom
 */
import type { SchemaLicense } from '@/integrations/api/api.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
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

function wrapper() {
	const queryClient = new QueryClient();
	return ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}
	</QueryClientProvider>;
}

async function applyLicenses() {
	const { result } = renderHook(() => useApplyLicensesClick({ licenses: LICENSES }), { wrapper: wrapper() });
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
});

function cancel() {
	const [, options] = vi.mocked(toast.loading).mock.calls.at(-1)!;
	(options as unknown as { action: { onClick: () => void } }).action.onClick();
}
