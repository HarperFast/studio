/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { post, page } = vi.hoisted(() => ({
	post: vi.fn(),
	page: { local: true, cluster: undefined as unknown, config: {} as Record<string, unknown>, entityId: 'ins-1' },
}));

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ instanceId: 'ins-1' }),
	useLoaderData: () => ({ version: '5.4.0-beta.4' }),
}));
vi.mock('@/config/constants', async (importOriginal) => ({
	...await importOriginal<typeof import('@/config/constants')>(),
	get isLocalStudio() {
		return page.local;
	},
}));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityType: 'instance', entityId: page.entityId, instanceClient: { post } }),
}));
vi.mock('@/components/RestartButton', () => ({ RestartButton: () => null }));
vi.mock('@/components/ApplyLicensesButton', () => ({ ApplyLicensesButton: () => null }));
vi.mock('@/features/instance/config/overview/components/HarperVersion', () => ({ HarperVersion: () => null }));
vi.mock('@/features/instance/config/overview/components/InstanceNodeName', () => ({ InstanceNodeName: () => null }));
vi.mock('@/features/instance/config/overview/components/InstanceURL', () => ({ InstanceURL: () => null }));
vi.mock('@/features/instance/config/overview/components/ApplicationURL', () => ({ ApplicationURL: () => null }));
vi.mock('@/features/instance/config/overview/components/LastDeployedTimestamp', () => ({
	LastDeployedTimestamp: () => null,
}));
vi.mock('@/features/instance/config/overview/harper-config/configMonaco', () => ({
	configureHarperConfigEditor: () => Promise.resolve(),
	HARPER_CONFIG_MODEL_PATH: 'harper-config.json',
}));
// A native <select> for the Radix one, whose portal listbox jsdom does not open. It takes the trigger's id, so the
// field's <label> still names it.
vi.mock('@/components/ui/select', async () => {
	const { Children, isValidElement } = await import('react');
	interface StubProps {
		value?: string;
		onValueChange?: (value: string) => void;
		disabled?: boolean;
		children?: import('react').ReactNode;
		id?: string;
		'aria-describedby'?: string;
	}
	const SelectTrigger = (_props: StubProps) => null;
	const SelectContent = ({ children }: StubProps) => <>{children}</>;
	const SelectItem = ({ value, children }: StubProps) => <option value={value}>{children}</option>;
	const Select = ({ value, onValueChange, disabled, children }: StubProps) => {
		const parts = Children.toArray(children).filter(isValidElement);
		const trigger = parts.find(part => part.type === SelectTrigger)?.props as StubProps | undefined;
		const content = parts.find(part => part.type === SelectContent)?.props as StubProps | undefined;
		return (
			<select
				id={trigger?.id}
				aria-describedby={trigger?.['aria-describedby']}
				value={value}
				disabled={disabled}
				onChange={event => onValueChange?.(event.target.value)}
			>
				{content?.children}
			</select>
		);
	};
	return { Select, SelectTrigger, SelectContent, SelectItem, SelectValue: () => null };
});
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
	getInstanceInfoQueryOptions: () => ({
		queryKey: ['test', 'instance_info'],
		queryFn: () => (page.cluster ? { cluster: page.cluster, instance: {} } : {}),
	}),
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
	getConfigurationQueryOptions: ({ entityId }: { entityId: string }) => ({
		queryKey: ['get_configuration', entityId],
		queryFn: () => page.config,
	}),
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
	http: { cors: true, port: 9926, keepAliveTimeout: 301000, corsAccessList: ['https://fabric.harper.fast'] },
	logging: { level: 'warn', file: true, external: { level: 'info' } },
	operationsApi: { network: { cors: true, port: 9925 } },
};

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
	page.local = true;
	page.cluster = undefined;
	page.config = structuredClone(CONFIG);
	page.entityId = 'ins-1';
	post.mockResolvedValue({ data: { message: 'ok' } });
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderPage() {
	render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<ConfigOverviewIndex />
		</QueryClientProvider>,
	);
}

function openTab(name: string) {
	fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
}

async function openSection(name: string) {
	fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }));
}

function sentBodies() {
	return post.mock.calls.map(([, body]) => body);
}

async function reviewAndSave() {
	fireEvent.click(screen.getByRole('button', { name: /^Review & Save/ }));
	const dialog = await screen.findByRole('alertdialog');
	fireEvent.click(within(dialog).getByRole('button', { name: 'Save & Restart' }));
	await waitFor(() => expect(toast.success).toHaveBeenCalled());
	return sentBodies();
}

async function saveJsonEdit(edit: (config: Record<string, any>) => void) {
	renderPage();
	await screen.findByRole('button', { name: /^HTTP/ });
	openTab('Advanced JSON');
	const editor = await screen.findByRole('textbox', { name: 'Instance config' });
	const config = JSON.parse((editor as HTMLTextAreaElement).value);
	edit(config);
	fireEvent.change(editor, { target: { value: JSON.stringify(config, null, 4) } });
	return reviewAndSave();
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
		const sent = await saveJsonEdit(edit);

		expect(sent).toEqual([
			{ operation: 'set_configuration', ...written },
			{ operation: 'restart', replicated: false },
		]);
		expect(sent[1]).not.toHaveProperty('service', 'http');
	});
});

describe('ConfigOverviewIndex forms', () => {
	it('changes the log level from the form, and lists the change before saving', async () => {
		renderPage();
		await openSection('Logging');
		fireEvent.change(screen.getAllByRole('combobox', { name: 'Level' })[0], { target: { value: 'debug' } });

		fireEvent.click(screen.getByRole('button', { name: 'Review & Save (1)' }));
		const dialog = await screen.findByRole('alertdialog');
		expect(within(dialog).getByText('logging.level')).toBeTruthy();
		expect(within(dialog).getByText('warn')).toBeTruthy();
		expect(within(dialog).getByText('debug')).toBeTruthy();
		expect(within(dialog).getByText('Saving restarts Harper, so it stops answering for a moment.')).toBeTruthy();
		fireEvent.click(within(dialog).getByRole('button', { name: 'Save & Restart' }));

		await waitFor(() => expect(toast.success).toHaveBeenCalled());
		expect(sentBodies()[0]).toEqual({ operation: 'set_configuration', logging_level: 'debug' });
	});

	it('says a duration in words, the way Harper reads it', async () => {
		page.config = { ...structuredClone(CONFIG), logging: { ...CONFIG.logging, auditRetention: '3d' } };
		renderPage();
		await openSection('Logging');
		expect(screen.getByText('Harper reads this as 3 days.')).toBeTruthy();

		fireEvent.change(screen.getByRole('textbox', { name: 'Audit retention' }), { target: { value: '3 days' } });
		expect(screen.getByText('Harper reads this as 3 seconds.')).toBeTruthy();
		expect(screen.getByText('Was 3d (3 days).')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: /^Review & Save/ }));
		const dialog = await screen.findByRole('alertdialog');
		expect(within(dialog).getByText('3d (3 days)')).toBeTruthy();
		expect(within(dialog).getByText('3 days (3 seconds)')).toBeTruthy();
	});

	it('changes a CORS list from the form, one origin per line', async () => {
		renderPage();
		await openSection('HTTP');
		fireEvent.change(screen.getByRole('textbox', { name: 'CORS access list' }), {
			target: { value: 'https://fabric.harper.fast\n  https://app.example.com  \n\n' },
		});

		const sent = await reviewAndSave();
		expect(sent[0]).toEqual({
			operation: 'set_configuration',
			http_corsAccessList: ['https://fabric.harper.fast', 'https://app.example.com'],
		});
	});

	it('turns a switch off and sends only that setting', async () => {
		renderPage();
		await openSection('HTTP');
		fireEvent.click(screen.getByRole('switch', { name: 'CORS' }));

		const sent = await reviewAndSave();
		expect(sent[0]).toEqual({ operation: 'set_configuration', http_cors: false });
	});

	it('refuses a number that is not one, and saves once it is', async () => {
		renderPage();
		await openSection('Authentication');
		const input = screen.getByRole('textbox', { name: 'Cache TTL' });
		fireEvent.change(input, { target: { value: 'soon' } });
		expect(screen.getByText('Enter a number.')).toBeTruthy();
		expect((screen.getByRole('button', { name: /^Review & Save/ }) as HTMLButtonElement).disabled).toBe(true);

		fireEvent.change(input, { target: { value: '60000' } });
		expect(screen.queryByText('Enter a number.')).toBeNull();
		const sent = await reviewAndSave();
		expect(sent[0]).toEqual({ operation: 'set_configuration', authentication_cacheTTL: 60000 });
	});

	it("drops a field's error when the field goes, so it can't block a save from another section", async () => {
		renderPage();
		await openSection('Authentication');
		fireEvent.change(screen.getByRole('textbox', { name: 'Cache TTL' }), { target: { value: 'soon' } });
		expect(screen.getByText('Enter a number.')).toBeTruthy();

		await openSection('HTTP');
		fireEvent.click(screen.getByRole('switch', { name: 'CORS' }));
		expect((screen.getByRole('button', { name: 'Review & Save (1)' }) as HTMLButtonElement).disabled).toBe(false);

		await openSection('Authentication');
		expect((screen.getByRole('textbox', { name: 'Cache TTL' }) as HTMLInputElement).value).toBe('30000');
		expect(screen.queryByText('Enter a number.')).toBeNull();
	});

	it('lets an unset choice go back to unset after one is picked', async () => {
		renderPage();
		await openSection('HTTP');
		const level = () => screen.getAllByRole('combobox', { name: 'Level' })[0] as HTMLSelectElement;
		fireEvent.change(level(), { target: { value: 'debug' } });
		expect(screen.getByRole('button', { name: 'Review & Save (1)' })).toBeTruthy();

		const notSet = [...level().options].find(option => option.text.startsWith('Not set'))!;
		fireEvent.change(level(), { target: { value: notSet.value } });
		expect(screen.getByRole('button', { name: 'Review & Save' })).toBeTruthy();
	});

	it('carries a form change into Advanced JSON and back', async () => {
		renderPage();
		await openSection('Logging');
		fireEvent.change(screen.getAllByRole('combobox', { name: 'Level' })[0], { target: { value: 'error' } });
		openTab('Advanced JSON');
		const editor = await screen.findByRole('textbox', { name: 'Instance config' });
		const config = JSON.parse((editor as HTMLTextAreaElement).value);
		expect(config.logging.level).toBe('error');

		config.logging.level = 'fatal';
		fireEvent.change(editor, { target: { value: JSON.stringify(config) } });
		openTab('Form');
		await openSection('Logging');
		expect((screen.getAllByRole('combobox', { name: 'Level' })[0] as HTMLSelectElement).value).toBe('fatal');
	});

	it('keeps the form closed while the JSON does not parse', async () => {
		renderPage();
		await screen.findByRole('button', { name: /^HTTP/ });
		openTab('Advanced JSON');
		fireEvent.change(await screen.findByRole('textbox', { name: 'Instance config' }), { target: { value: '{' } });
		expect(screen.getByText('Invalid JSON')).toBeTruthy();
		expect((screen.getByRole('tab', { name: 'Form' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('puts an unset switch back to unset when it is switched back', async () => {
		renderPage();
		await openSection('HTTP');
		fireEvent.click(screen.getByRole('switch', { name: 'HTTP/2' }));
		expect(screen.getByRole('button', { name: 'Review & Save (1)' })).toBeTruthy();

		fireEvent.click(screen.getByRole('switch', { name: 'HTTP/2' }));
		expect(screen.getByRole('button', { name: 'Review & Save' })).toBeTruthy();
	});

	it('starts a fresh draft when the page moves to another instance', async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const page$ = () => (
			<QueryClientProvider client={client}>
				<ConfigOverviewIndex />
			</QueryClientProvider>
		);
		const { rerender } = render(page$());
		await openSection('Logging');
		fireEvent.change(screen.getAllByRole('combobox', { name: 'Level' })[0], { target: { value: 'debug' } });
		expect(screen.getByRole('button', { name: 'Review & Save (1)' })).toBeTruthy();

		page.entityId = 'ins-2';
		rerender(page$());
		await openSection('Logging');
		expect(screen.getByRole('button', { name: 'Review & Save' })).toBeTruthy();
		expect((screen.getAllByRole('combobox', { name: 'Level' })[0] as HTMLSelectElement).value).toBe('warn');
	});

	it("keeps a save that didn't finish on every instance ready to send again, though the refetch shows it", async () => {
		let restartFails = true;
		post.mockImplementation(async (_url: string, body: Record<string, unknown>) => {
			if (body.operation === 'set_configuration' && typeof body.logging_level === 'string') {
				const logging = page.config.logging as Record<string, unknown>;
				page.config = { ...page.config, logging: { ...logging, level: body.logging_level } };
			}
			if (body.operation === 'restart' && restartFails) { throw new Error('restart failed'); }
			return { data: { message: 'ok' } };
		});
		renderPage();
		await openSection('Logging');
		fireEvent.change(screen.getAllByRole('combobox', { name: 'Level' })[0], { target: { value: 'debug' } });
		fireEvent.click(screen.getByRole('button', { name: 'Review & Save (1)' }));
		fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Save & Restart' }));

		expect(await screen.findByText("The last save didn't finish on every instance")).toBeTruthy();
		await waitFor(() =>
			expect((screen.getAllByRole('combobox', { name: 'Level' })[0] as HTMLSelectElement).value).toBe('debug')
		);
		expect(screen.getByRole('button', { name: 'Review & Save (1)' })).toBeTruthy();

		restartFails = false;
		fireEvent.click(screen.getByRole('button', { name: 'Review & Save (1)' }));
		const dialog = await screen.findByRole('alertdialog');
		expect(within(dialog).getByText('logging.level')).toBeTruthy();
		fireEvent.click(within(dialog).getByRole('button', { name: 'Save & Restart' }));
		await waitFor(() => expect(toast.success).toHaveBeenCalled());
		await waitFor(() => expect(screen.queryByText("The last save didn't finish on every instance")).toBeNull());
		expect(screen.getByRole('button', { name: 'Review & Save' })).toBeTruthy();
		const writes = post.mock.calls.map(([, body]) => body).filter(body => body.operation === 'set_configuration');
		expect(writes).toEqual([
			{ operation: 'set_configuration', logging_level: 'debug' },
			{ operation: 'set_configuration', logging_level: 'debug' },
		]);
	});

	it('stops sending an unconfirmed setting again once the user puts it back', async () => {
		post.mockImplementation(async (_url: string, body: Record<string, unknown>) => {
			if (body.operation === 'restart') { throw new Error('restart failed'); }
			return { data: { message: 'ok' } };
		});
		renderPage();
		await openSection('Logging');
		const level = () => screen.getAllByRole('combobox', { name: 'Level' })[0] as HTMLSelectElement;
		fireEvent.change(level(), { target: { value: 'debug' } });
		fireEvent.click(screen.getByRole('button', { name: 'Review & Save (1)' }));
		fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Save & Restart' }));
		expect(await screen.findByText("The last save didn't finish on every instance")).toBeTruthy();

		fireEvent.change(level(), { target: { value: 'warn' } });
		expect(screen.getByRole('button', { name: 'Review & Save' })).toBeTruthy();
		expect(screen.queryByText("The last save didn't finish on every instance")).toBeNull();
	});

	it('puts every setting back on Discard', async () => {
		renderPage();
		await openSection('HTTP');
		fireEvent.click(screen.getByRole('switch', { name: 'CORS' }));
		expect(screen.getByRole('button', { name: 'Review & Save (1)' })).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
		expect(screen.getByRole('switch', { name: 'CORS' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
	});

	it('finds a setting across sections', async () => {
		renderPage();
		await screen.findByRole('button', { name: /^HTTP/ });
		fireEvent.change(screen.getByRole('searchbox', { name: 'Find a setting' }), { target: { value: 'keep alive' } });
		expect(screen.getByRole('region', { name: 'HTTP' })).toBeTruthy();
		expect(screen.getByRole('region', { name: 'Operations API › Network' })).toBeTruthy();
		expect(screen.getAllByText('Keep alive timeout')).toHaveLength(2);
	});

	it("shows Harper's own reason inline when it refuses the change", async () => {
		post.mockImplementation((_url, body) =>
			body.operation === 'set_configuration'
				? Promise.reject(
					new AxiosError('Request failed with status code 400', AxiosError.ERR_BAD_REQUEST, undefined, undefined, {
						status: 400,
						data: { error: "'logging.level' must be one of [trace, debug]" },
					} as never),
				)
				: Promise.resolve({ data: { message: 'ok' } })
		);
		renderPage();
		await openSection('Logging');
		fireEvent.change(screen.getAllByRole('combobox', { name: 'Level' })[0], { target: { value: 'notify' } });
		fireEvent.click(screen.getByRole('button', { name: /^Review & Save/ }));
		fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Save & Restart' }));

		expect(await screen.findByText('Harper refused the change')).toBeTruthy();
		expect(screen.getByText("'logging.level' must be one of [trace, debug]")).toBeTruthy();
	});
});

describe('ConfigOverviewIndex on Fabric', () => {
	beforeEach(() => {
		page.local = false;
		page.cluster = { id: 'c-1', plans: [{ planId: 'standard' }], instances: [] };
	});

	it('shows what Fabric sets as read-only, and says why', async () => {
		renderPage();
		await openSection('HTTP');
		const keepAlive = screen.getByRole('textbox', { name: 'Keep alive timeout' }) as HTMLInputElement;
		expect(keepAlive.disabled).toBe(true);
		expect(keepAlive.value).toBe('301000');
		expect(screen.getAllByText('Managed by Fabric').length).toBeGreaterThan(0);
		expect(screen.getByText(/HTTP_KEEPALIVETIMEOUT environment variable/)).toBeTruthy();
	});

	it('marks a Fabric default as changeable, with its value', async () => {
		renderPage();
		await openSection('Logging');
		const external = screen.getByRole('region', { name: 'External' });
		expect(within(external).getByText('Fabric default')).toBeTruthy();
		expect(within(external).getByText(/Fabric starts this at "info"/)).toBeTruthy();
		expect((within(external).getByRole('combobox', { name: 'Level' }) as HTMLSelectElement).disabled).toBe(false);
	});

	it('refuses to save a change to a Fabric setting made in Advanced JSON', async () => {
		renderPage();
		await screen.findByRole('button', { name: /^HTTP/ });
		openTab('Advanced JSON');
		const editor = await screen.findByRole('textbox', { name: 'Instance config' });
		const config = JSON.parse((editor as HTMLTextAreaElement).value);
		config.logging.file = false;
		fireEvent.change(editor, { target: { value: JSON.stringify(config) } });

		expect(screen.getByText("These changes can't be saved")).toBeTruthy();
		expect(screen.getByText(/Fabric sets this every time the instance starts \(through HARPER_SET_CONFIG\)/))
			.toBeTruthy();
		expect((screen.getByRole('button', { name: /^Review & Save/ }) as HTMLButtonElement).disabled).toBe(true);
		expect(post).not.toHaveBeenCalledWith('/', expect.objectContaining({ operation: 'set_configuration' }));
	});

	it('marks nothing on a self-managed cluster', async () => {
		page.cluster = { id: 'c-1', plans: [{ planId: 'self-hosted-free' }], instances: [] };
		renderPage();
		await openSection('HTTP');
		await waitFor(() =>
			expect((screen.getByRole('textbox', { name: 'Keep alive timeout' }) as HTMLInputElement).disabled).toBe(false)
		);
		expect(screen.queryByText('Managed by Fabric')).toBeNull();
	});

	it('warns before a CORS change that would lock this Studio out', async () => {
		page.config = {
			...structuredClone(CONFIG),
			operationsApi: { network: { cors: true, corsAccessList: [window.location.origin] } },
		};
		renderPage();
		await openSection('Operations API');
		fireEvent.change(screen.getByRole('textbox', { name: 'CORS access list' }), {
			target: { value: 'https://elsewhere.example' },
		});
		fireEvent.click(screen.getByRole('button', { name: /^Review & Save/ }));
		const dialog = await screen.findByRole('alertdialog');
		expect(within(dialog).getByText(/no longer includes/)).toBeTruthy();
		expect(within(dialog).getByText('Saving writes the changes to this instance and restarts it.')).toBeTruthy();
	});
});
