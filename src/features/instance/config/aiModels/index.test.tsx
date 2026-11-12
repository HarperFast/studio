/** @vitest-environment jsdom */
import { ConfigAiModelsIndex } from '@/features/instance/config/aiModels';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'sk-live-do-not-show';
const TOKEN = 'eyJhbGciOiJFUzI1NiJ9.tenant-token';

const { state, remove, toast } = vi.hoisted(() => ({
	state: {
		canManage: true,
		version: '5.4.0' as string | undefined,
		versionError: false,
		configuration: undefined as unknown,
		configurationError: false,
		cluster: undefined as unknown,
		clusterError: false,
		entityId: 'clu-1',
		params: { clusterId: 'clu-1' } as { clusterId?: string; instanceId?: string },
		local: false,
		fabricKeepsCustomerModels: false,
	},
	remove: { mutate: vi.fn(), isPending: false },
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: (options: { queryKey: readonly unknown[]; enabled?: boolean }) => {
		const [first] = options.queryKey;
		if (first === 'registration_info') {
			return {
				data: state.version === undefined ? undefined : { version: state.version },
				isError: state.versionError,
			};
		}
		if (first === 'get_configuration') {
			return {
				data: options.enabled === false ? undefined : state.configuration,
				isError: state.configurationError,
				isFetching: false,
				refetch: vi.fn(),
			};
		}
		return { data: state.cluster, isError: state.clusterError };
	},
}));
vi.mock('@tanstack/react-router', () => ({ useParams: () => state.params }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: state.entityId, entityType: 'cluster' }),
}));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => state.canManage }));
vi.mock('@/config/constants', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/config/constants')>()),
	get isLocalStudio() {
		return state.local;
	},
}));
vi.mock('@/integrations/api/instance/models/models', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/models/models')>()),
	get FABRIC_KEEPS_CUSTOMER_MODELS() {
		return state.fabricKeepsCustomerModels;
	},
}));
vi.mock('./ModelsApiCard', () => ({
	ModelsApiCard: ({ servesOwnPorts }: { servesOwnPorts: boolean }) => (
		<div data-testid="v1-card" data-own-ports={String(servesOwnPorts)} />
	),
}));
vi.mock('./ModelDialog', () => ({
	ModelDialog: ({ target }: { target: { mode: string; name?: string } }) => (
		<div data-testid="model-dialog">{target.mode} {target.name}</div>
	),
}));
vi.mock('./useSaveModelChange', () => ({ useSaveModelChange: () => remove }));
vi.mock('sonner', () => ({ toast }));

const models = {
	embedding: {
		default: { backend: 'openai', baseUrl: 'https://hub-1.example.com/v1', apiKey: TOKEN, model: 'default' },
	},
	generative: {
		mine: { backend: 'openai', apiKey: SECRET, model: 'gpt-x', fallback: ['spare'] },
		spare: { backend: 'anthropic', apiKey: '${ANTHROPIC_API_KEY}', model: 'claude-x' },
		custom: { backend: './my-backend.js' },
	},
};

const fabricCluster = {
	id: 'clu-1',
	plans: [{ planId: 'fabric-standard' }],
	instances: [{ id: 'ins-1', modelsConfig: { embedding: { default: { apiKey: '[REDACTED]' } } } }],
};
const selfManagedCluster = { id: 'clu-1', plans: [{ planId: 'self-hosted-free' }], instances: [{ id: 'ins-1' }] };

beforeEach(() => {
	Object.assign(state, {
		canManage: true,
		version: '5.4.0',
		versionError: false,
		configuration: { models, modelsGateway: { enabled: false } },
		configurationError: false,
		cluster: selfManagedCluster,
		clusterError: false,
		entityId: 'clu-1',
		params: { clusterId: 'clu-1' },
		local: false,
		fabricKeepsCustomerModels: false,
	});
	remove.mutate.mockReset();
	remove.isPending = false;
});
afterEach(cleanup);

describe('who sees the page', () => {
	it('tells a role that cannot manage the instance why it is empty', () => {
		state.canManage = false;
		render(<ConfigAiModelsIndex />);
		expect(screen.getByText('Only super users can view or change AI models.')).toBeTruthy();
		expect(screen.queryByText('AI Models')).toBeNull();
	});

	it('names the version it needs on an instance older than 5.1', () => {
		state.version = '5.0.4';
		render(<ConfigAiModelsIndex />);
		expect(screen.getByText('AI models need Harper 5.1 or later. This instance runs 5.0.4.')).toBeTruthy();
	});

	it('says so when the version could not be read, rather than guessing', () => {
		state.version = undefined;
		state.versionError = true;
		render(<ConfigAiModelsIndex />);
		expect(screen.getByText(/Harper version could not be read/)).toBeTruthy();
	});

	it('says so when the settings could not be loaded', () => {
		state.configuration = undefined;
		state.configurationError = true;
		render(<ConfigAiModelsIndex />);
		expect(screen.getByText(/settings could not be loaded/)).toBeTruthy();
	});
});

describe('listing the models', () => {
	it('shows each entry by name, backend and model, and never a key or token', () => {
		render(<ConfigAiModelsIndex />);
		const mine = screen.getByLabelText('generative model mine');
		expect(within(mine).getByText('openai')).toBeTruthy();
		expect(within(mine).getByText('gpt-x')).toBeTruthy();
		expect(within(mine).getByText('spare')).toBeTruthy();
		expect(within(mine).getByText('Key saved')).toBeTruthy();
		expect(within(screen.getByLabelText('generative model spare')).getByText('Key from ${ANTHROPIC_API_KEY}'))
			.toBeTruthy();
		expect(document.body.innerHTML).not.toContain(SECRET);
		expect(document.body.innerHTML).not.toContain(TOKEN);
	});

	it('groups them by kind, with an empty kind saying so', () => {
		render(<ConfigAiModelsIndex />);
		expect(within(screen.getByLabelText('Embedding models')).getByLabelText('embedding model default')).toBeTruthy();
		expect(within(screen.getByLabelText('Embedding models')).queryByLabelText('generative model mine')).toBeNull();
		expect(within(screen.getByLabelText('Decision models')).getByText('None set up.')).toBeTruthy();
	});

	it('leaves decision models out before the release that has them', () => {
		state.version = '5.2.4';
		render(<ConfigAiModelsIndex />);
		expect(screen.queryByLabelText('Decision models')).toBeNull();
		expect(screen.getByLabelText('Generative models')).toBeTruthy();
	});

	it('says a cluster view is one instance’s models', () => {
		render(<ConfigAiModelsIndex />);
		expect(screen.getByText(/one instance in your cluster/)).toBeTruthy();
	});

	it('offers the /v1 API card only from the release that has it', () => {
		render(<ConfigAiModelsIndex />);
		expect(screen.getByTestId('v1-card')).toBeTruthy();
		cleanup();
		state.version = '5.2.0';
		render(<ConfigAiModelsIndex />);
		expect(screen.queryByTestId('v1-card')).toBeNull();
	});

	it("tells the /v1 card to use the config's port only where Studio reaches Harper on its own ports", () => {
		const ownPorts = () => {
			render(<ConfigAiModelsIndex />);
			const value = screen.getByTestId('v1-card').getAttribute('data-own-ports');
			cleanup();
			return value;
		};
		expect(ownPorts()).toBe('false');
		state.params = { clusterId: 'clu-1', instanceId: 'ins-1' };
		expect(ownPorts()).toBe('true');
		state.cluster = fabricCluster;
		expect(ownPorts()).toBe('false');
		state.cluster = undefined;
		expect(ownPorts()).toBe('false');
		state.params = {};
		state.local = true;
		expect(ownPorts()).toBe('true');
	});
});

describe('on Fabric', () => {
	beforeEach(() => {
		state.cluster = fabricCluster;
	});

	it("marks Fabric's entries and says which they are and that Fabric manages them", () => {
		render(<ConfigAiModelsIndex />);
		expect(within(screen.getByLabelText('embedding model default')).getByText('Managed by Fabric')).toBeTruthy();
		expect(within(screen.getByLabelText('generative model mine')).queryByText('Managed by Fabric')).toBeNull();
		expect(screen.getByText(/on this instance and manages it/).textContent).toBe(
			"Fabric provides embedding.default on this instance and manages it: Fabric keeps it up to date, and it can't "
				+ 'be edited or removed here.',
		);
	});

	it('offers no way to add, edit or remove while host manager still replaces the list', () => {
		render(<ConfigAiModelsIndex />);
		expect(screen.getByText("Adding your own models isn't available on Fabric yet.")).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Add Model' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
	});

	it("once Fabric keeps customer entries, offers them for the customer's own models only", () => {
		state.fabricKeepsCustomerModels = true;
		render(<ConfigAiModelsIndex />);
		expect(screen.getByRole('button', { name: 'Add Model' })).toBeTruthy();
		expect(within(screen.getByLabelText('embedding model default')).queryByRole('button')).toBeNull();
		expect(within(screen.getByLabelText('generative model mine')).getByRole('button', { name: 'Edit' })).toBeTruthy();
	});

	it('offers nothing for change until it knows where the instance runs', () => {
		state.fabricKeepsCustomerModels = true;
		state.cluster = undefined;
		render(<ConfigAiModelsIndex />);
		expect(screen.queryByRole('button', { name: 'Add Model' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
		expect(screen.queryByText(/couldn't read this cluster/)).toBeNull();
	});

	it('says why nothing can be changed when the cluster could not be read', () => {
		state.cluster = undefined;
		state.clusterError = true;
		render(<ConfigAiModelsIndex />);
		expect(screen.getByText(/couldn't read this cluster/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Add Model' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
	});
});

describe('changing models off Fabric', () => {
	it('needs Harper 5.4, and says where to set them on an older version', () => {
		state.version = '5.3.6';
		render(<ConfigAiModelsIndex />);
		expect(screen.getByText(/needs Harper 5.4 or later. This cluster runs 5.3.6. On this version, set them in/))
			.toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Add Model' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
	});

	it('opens the dialog to add, and to edit an entry it has a form for', () => {
		render(<ConfigAiModelsIndex />);
		fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
		expect(screen.getByTestId('model-dialog').textContent).toBe('add ');
		cleanup();
		render(<ConfigAiModelsIndex />);
		fireEvent.click(within(screen.getByLabelText('generative model mine')).getByRole('button', { name: 'Edit' }));
		expect(screen.getByTestId('model-dialog').textContent).toBe('edit mine');
	});

	it('drops an open dialog when the page moves to another cluster or instance', () => {
		const { rerender } = render(<ConfigAiModelsIndex />);
		fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
		expect(screen.getByTestId('model-dialog')).toBeTruthy();
		state.entityId = 'clu-2';
		rerender(<ConfigAiModelsIndex />);
		expect(screen.queryByTestId('model-dialog')).toBeNull();
	});

	it('lets an entry with a custom backend be removed but not edited', () => {
		render(<ConfigAiModelsIndex />);
		const custom = within(screen.getByLabelText('generative model custom'));
		expect((custom.getByRole('button', { name: 'Edit' }) as HTMLButtonElement).disabled).toBe(true);
		expect((custom.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(false);
	});

	it('removes a model only after it is confirmed, sending what the page loaded', () => {
		render(<ConfigAiModelsIndex />);
		fireEvent.click(within(screen.getByLabelText('generative model spare')).getByRole('button', { name: 'Remove' }));
		expect(remove.mutate).not.toHaveBeenCalled();
		fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Remove/ }));
		expect(remove.mutate).toHaveBeenCalledTimes(1);
		const [args] = remove.mutate.mock.calls[0];
		expect(args.change).toEqual({ kind: 'generative', name: 'spare', loaded: models.generative.spare });
		expect(args.fabricKeys).toBeUndefined();
	});

	it("shows Harper's own error when it refuses the removal", () => {
		render(<ConfigAiModelsIndex />);
		fireEvent.click(within(screen.getByLabelText('generative model spare')).getByRole('button', { name: 'Remove' }));
		fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Remove/ }));
		const [, callbacks] = remove.mutate.mock.calls[0];
		callbacks.onError({ response: { data: { error: 'Cannot set models: HARPER_SET_CONFIG defines models.' } } });
		expect(toast.error).toHaveBeenCalledWith('Cannot set models: HARPER_SET_CONFIG defines models.');
	});

	it('treats a local Studio instance as its own, with nothing managed', () => {
		state.local = true;
		state.params = { instanceId: 'ins-1' };
		state.cluster = fabricCluster;
		render(<ConfigAiModelsIndex />);
		expect(screen.queryByText('Managed by Fabric')).toBeNull();
		expect(screen.getByRole('button', { name: 'Add Model' })).toBeTruthy();
		expect(screen.queryByText(/one instance in your cluster/)).toBeNull();
	});
});
