import type { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import type { AxiosInstance } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

const DATA_MAP = { data: { dog: { name: 'dog' } } };
const SYSTEM_TABLES = { hdb_user: { name: 'hdb_user' }, hdb_role: { name: 'hdb_role' } };

// `describe_all` deliberately omits the system database, so the mock mirrors the
// server: it returns the base map for `describe_all` and the system tables only for
// an explicit `describe_database` on `system`.
function makeClient() {
	const post = vi.fn(async (_url: string, body: { operation: string; database?: string }) => {
		if (body.operation === 'describe_all') { return { data: { ...DATA_MAP } }; }
		if (body.operation === 'describe_database' && body.database === 'system') { return { data: { ...SYSTEM_TABLES } }; }
		throw new Error(`unexpected operation: ${body.operation}`);
	});
	return {
		post,
		config: { instanceClient: { post } as unknown as AxiosInstance, entityId: 'e1' } as InstanceClientIdConfig,
	};
}

async function loadGetDescribeAll({ dev, localStudio }: { dev: boolean; localStudio: boolean }) {
	vi.resetModules();
	vi.stubEnv('DEV', dev);
	vi.stubEnv('VITE_LOCAL_STUDIO', localStudio ? 'true' : 'false');
	return (await import('./getDescribeAll')).getDescribeAll;
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('getDescribeAll system database exposure', () => {
	it('merges the system database when running the Vite dev server', async () => {
		const getDescribeAll = await loadGetDescribeAll({ dev: true, localStudio: false });
		const { post, config } = makeClient();

		const result = await getDescribeAll(config);

		expect(result).toEqual({ ...DATA_MAP, system: SYSTEM_TABLES });
		expect(post).toHaveBeenCalledWith('/', { operation: 'describe_database', database: 'system' });
	});

	it('merges the system database in Local Studio builds', async () => {
		const getDescribeAll = await loadGetDescribeAll({ dev: false, localStudio: true });
		const { post, config } = makeClient();

		const result = await getDescribeAll(config);

		expect(result).toEqual({ ...DATA_MAP, system: SYSTEM_TABLES });
		expect(post).toHaveBeenCalledTimes(2);
	});

	it('does not request the system database in non-dev, non-local builds', async () => {
		const getDescribeAll = await loadGetDescribeAll({ dev: false, localStudio: false });
		const { post, config } = makeClient();

		const result = await getDescribeAll(config);

		expect(result).toEqual(DATA_MAP);
		expect(post).toHaveBeenCalledTimes(1);
	});

	it('skips the extra request when describe_all already returns system', async () => {
		const getDescribeAll = await loadGetDescribeAll({ dev: true, localStudio: false });
		const post = vi.fn(async () => ({ data: { ...DATA_MAP, system: SYSTEM_TABLES } }));
		const config = { instanceClient: { post } as unknown as AxiosInstance, entityId: 'e1' } as InstanceClientIdConfig;

		const result = await getDescribeAll(config);

		expect(result).toEqual({ ...DATA_MAP, system: SYSTEM_TABLES });
		expect(post).toHaveBeenCalledTimes(1);
	});

	it('falls back to the base map when the system describe fails', async () => {
		const getDescribeAll = await loadGetDescribeAll({ dev: true, localStudio: false });
		const post = vi.fn(async (_url: string, body: { operation: string }) => {
			if (body.operation === 'describe_all') { return { data: { ...DATA_MAP } }; }
			throw new Error('insufficient permissions');
		});
		const config = { instanceClient: { post } as unknown as AxiosInstance, entityId: 'e1' } as InstanceClientIdConfig;

		const result = await getDescribeAll(config);

		expect(result).toEqual(DATA_MAP);
	});
});
