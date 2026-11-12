/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ instanceId: 'ins-1' }),
	useLoaderData: () => ({ version: '5.4.0-beta.4' }),
}));
vi.mock('@/config/constants', async (importOriginal) => ({
	...await importOriginal<typeof import('@/config/constants')>(),
	isLocalStudio: true,
}));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityType: 'instance', entityId: 'ins-1', instanceClient: { post } }),
}));
vi.mock('@/components/RestartButton', () => ({ RestartButton: () => null }));
vi.mock('@/features/instance/config/overview/components/HarperVersion', () => ({ HarperVersion: () => null }));
vi.mock('@/features/instance/config/overview/components/LastDeployedTimestamp', () => ({
	LastDeployedTimestamp: () => null,
}));
vi.mock('@/features/instance/config/overview/harper-config/configMonaco', () => ({
	configureHarperConfigEditor: () => Promise.resolve(),
	HARPER_CONFIG_MODEL_PATH: 'harper-config.json',
}));
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'vs-dark' }));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => false }));
vi.mock('@/lib/monaco/MonacoEditor', () => ({
	Editor: ({ value, onChange, options }: {
		value: string;
		onChange: (value: string) => void;
		options: { readOnly: boolean };
	}) => (
		<textarea
			aria-label="Instance config"
			readOnly={options.readOnly}
			value={value}
			onChange={event => onChange(event.target.value)}
		/>
	),
}));
vi.mock('@/features/cluster/queries/getInstanceInfoQuery', () => ({
	getInstanceInfoQueryOptions: () => ({ queryKey: ['test', 'instance_info'], queryFn: () => ({}) }),
}));
vi.mock('@/integrations/api/instance/status/getUsageLicenses', () => ({
	getUsageLicensesQueryOptions: () => ({ queryKey: ['test', 'licenses'], queryFn: () => [], enabled: false }),
}));
vi.mock('@/integrations/api/instance/status/getRegistrationInfo', () => ({
	getRegistrationInfoQueryOptions: () => ({
		queryKey: ['test', 'registration_info'],
		queryFn: () => ({ version: '5.4.0-beta.4' }),
	}),
}));
vi.mock('@/integrations/api/instance/applications/getComponents', () => ({
	getComponentsQueryOptions: () => ({ queryKey: ['test', 'components'], queryFn: () => null, enabled: false }),
}));
vi.mock('@/integrations/api/instance/status/getConfiguration', () => ({
	getConfigurationQueryOptions: () => ({ queryKey: ['get_configuration', 'ins-1'], queryFn: () => CONFIG }),
}));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({
	getInstanceUserInfo: vi.fn().mockResolvedValue({ username: 'admin' }),
}));
vi.mock('@/lib/sleep', () => ({ sleep: vi.fn().mockResolvedValue(true) }));
vi.mock('sonner', () => ({
	toast: { loading: vi.fn(() => 'toast-1'), error: vi.fn(), success: vi.fn(), dismiss: vi.fn() },
}));

import { ConfigOverviewIndex } from '@/features/instance/config/overview/index';
import { toast } from 'sonner';

const CONFIG = {
	authentication: { authorizeLocal: true, cacheTTL: 30000 },
	http: { cors: true, port: 9926 },
	logging: { level: 'warn' },
	operationsApi: { network: { cors: true, port: 9925 } },
};

beforeEach(() => {
	post.mockResolvedValue({ data: { message: 'ok' } });
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

async function saveEdit(edit: (config: Record<string, any>) => void) {
	render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<ConfigOverviewIndex />
		</QueryClientProvider>,
	);
	const editor = await screen.findByRole('textbox', { name: 'Instance config' });
	fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
	const config = JSON.parse((editor as HTMLTextAreaElement).value);
	edit(config);
	fireEvent.change(editor, { target: { value: JSON.stringify(config, null, 4) } });
	fireEvent.click(screen.getByRole('button', { name: 'Save & Restart' }));
	await waitFor(() => expect(toast.success).toHaveBeenCalled());
	return post.mock.calls.map(([, body]) => body);
}

describe('ConfigOverviewIndex save', () => {
	it.each([
		['turns on the operations MCP server', (config: Record<string, any>) => {
			config.mcp = { operations: { enabled: true } };
		}, { mcp_operations_enabled: true }],
		['changes an operations API setting', (config: Record<string, any>) => {
			config.operationsApi.network.cors = false;
		}, { operationsApi_network_cors: false }],
		['changes an authentication setting the main thread reads at startup', (config: Record<string, any>) => {
			config.authentication.authorizeLocal = false;
		}, { authentication_authorizeLocal: false }],
		['changes a setting only the HTTP workers read', (config: Record<string, any>) => {
			config.http.cors = false;
		}, { http_cors: false }],
		['changes the log level', (config: Record<string, any>) => {
			config.logging.level = 'debug';
		}, { logging_level: 'debug' }],
	])('restarts all of Harper, not just its HTTP workers, when it %s', async (_label, edit, written) => {
		const sent = await saveEdit(edit);

		expect(sent).toEqual([
			{ operation: 'set_configuration', ...written },
			{ operation: 'restart', replicated: false },
		]);
		expect(sent[1]).not.toHaveProperty('service', 'http');
	});
});
