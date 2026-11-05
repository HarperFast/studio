/**
 * @vitest-environment jsdom
 */
import { ciDeployNames } from '@/integrations/api/instance/ciDeploy/ciDeploy';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationDeploys } from './ApplicationDeploys';

const AUDIENCE = 'https://cluster.example.com:9925/';

const { cluster, post, toast } = vi.hoisted(() => {
	const cluster = {
		operationsUrl: 'https://cluster.example.com:9925/' as string | undefined,
		roles: [] as Record<string, unknown>[],
		users: [] as Record<string, unknown>[],
		policies: [] as Record<string, unknown>[],
		failAddUser: undefined as number | undefined,
	};
	const post = vi.fn(async (_url: string, body: Record<string, unknown>) => {
		const { operation, ...rest } = body;
		switch (operation) {
			case 'list_oidc_trust':
				return { data: { policies: cluster.policies } };
			case 'list_roles':
				return { data: cluster.roles };
			case 'list_users':
				return { data: cluster.users };
			case 'add_role':
				cluster.roles.push(rest);
				return { data: rest };
			case 'add_user':
				if (cluster.failAddUser) {
					throw Object.assign(new Error(`Request failed with status code ${cluster.failAddUser}`), {
						isAxiosError: true,
						config: { method: 'post', data: JSON.stringify(body) },
						response: { status: cluster.failAddUser, data: { error: 'Harper refused the user' } },
					});
				}
				cluster.users.push({ username: rest.username, active: rest.active, role: { role: rest.role } });
				return { data: { message: 'added' } };
			case 'add_oidc_trust':
				cluster.policies.push({ ...rest, enabled: true });
				return { data: { message: 'set' } };
		}
		throw new Error(`unexpected ${String(operation)}`);
	});
	return { cluster, post, toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() } };
});

vi.mock('@/config/useInstanceClient', () => {
	const params = { instanceClient: { post }, entityId: 'clu-1', entityType: 'cluster' };
	return { useInstanceClientIdParams: () => params };
});
vi.mock('@/features/auth/store/authStore', () => ({
	authStore: { getOperationsUrl: () => cluster.operationsUrl },
}));
vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({}),
	Link: ({ children, to }: { children: unknown; to: string }) => <a href={to}>{children as never}</a>,
}));
vi.mock('@/features/cluster/queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: () => ({ queryKey: ['cluster'], queryFn: vi.fn(), enabled: false }),
}));
vi.mock('sonner', () => ({ toast }));

const NAMES = ciDeployNames('web')!;
const OPERATIONS = ['deploy_component', 'get_deployment', 'get_job', 'registration_info'];
const role = () => ({ role: 'web-ci-deploy', permission: { super_user: false, operations: OPERATIONS } });
const user = () => ({ username: 'web-ci-deploy', active: true, role: { role: 'web-ci-deploy' } });
const storedPolicy = (overrides: Record<string, unknown> = {}) => ({
	id: 'github-actions-web',
	issuer: 'https://token.actions.githubusercontent.com',
	audience: AUDIENCE,
	user: 'web-ci-deploy',
	claims: {
		repository_id: '42',
		workflow_ref: 'Acme/web/.github/workflows/deploy.yaml@refs/heads/main',
		environment: 'production',
	},
	operations: OPERATIONS,
	enabled: true,
	...overrides,
});

function stubGitHub(status: number, body: unknown = {}) {
	vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

function renderPanel() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
	});
	render(
		<QueryClientProvider client={queryClient}>
			<ApplicationDeploys app="web" names={NAMES} />
		</QueryClientProvider>,
	);
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Set up deploys' }));
const writes = () =>
	post.mock.calls.map(([, body]) => body as Record<string, unknown>).filter((body) =>
		!String(body.operation).startsWith('list_')
	);
const workflowText = () =>
	within(screen.getByRole('region', { name: 'What to commit' })).getByText(/name: Deploy/).textContent;

beforeEach(() => {
	Object.assign(cluster, { operationsUrl: AUDIENCE, roles: [], users: [], policies: [], failAddUser: undefined });
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('ApplicationDeploys', () => {
	it('creates the role, user and policy for a public repository, then shows what to commit', async () => {
		stubGitHub(200, { id: 42, full_name: 'Acme/web', private: false, default_branch: 'main' });
		renderPanel();
		await screen.findByLabelText('GitHub repository');
		type('GitHub repository', 'acme/web');
		expect(await screen.findByText('Acme/web, id 42.')).toBeTruthy();
		submit();

		expect(await screen.findByText('Deploys from GitHub are set up')).toBeTruthy();
		expect(screen.getByText('Created role web-ci-deploy, user web-ci-deploy, trust policy github-actions-web.'))
			.toBeTruthy();
		expect(writes().map((body) => body.operation)).toEqual(['add_role', 'add_user', 'add_oidc_trust']);
		expect(writes()[2]).toEqual({
			operation: 'add_oidc_trust',
			id: 'github-actions-web',
			issuer: 'https://token.actions.githubusercontent.com',
			audience: AUDIENCE,
			user: 'web-ci-deploy',
			claims: {
				repository_id: '42',
				workflow_ref: 'Acme/web/.github/workflows/deploy.yaml@refs/heads/main',
				environment: 'production',
			},
			operations: OPERATIONS,
			description: 'GitHub Actions deploys of web from Acme/web (.github/workflows/deploy.yaml on main)',
		});

		const status = screen.getByRole('region', { name: 'Deploy status' });
		expect(within(status).getByText('Set up')).toBeTruthy();
		expect(screen.queryByRole('form', { name: 'Set up deploys from GitHub' })).toBeNull();
		expect(workflowText()).toContain('app: "web"');
		expect(screen.getByRole('button', { name: 'Copy HARPER_CLI_TARGET' })).toBeTruthy();
		expect(within(screen.getByRole('region', { name: 'What to commit' })).getByText(AUDIENCE)).toBeTruthy();
	});

	it("takes a private repository's id and spelling from the gh line, and the branch, environment and file typed", async () => {
		stubGitHub(404);
		renderPanel();
		await screen.findByLabelText('GitHub repository');
		type('GitHub repository', 'acme/web');
		const identity = await screen.findByLabelText('Repository id and name');
		expect(screen.getByText('gh api repos/acme/web --jq \'"\\(.id) \\(.full_name)"\'')).toBeTruthy();
		fireEvent.change(identity, { target: { value: '777 Acme/web' } });
		type('Branch', 'release/1.0');
		type('Environment', 'prod-eu');
		type('Workflow file', './.github/workflows/ship.yml');
		submit();

		await screen.findByText('Deploys from GitHub are set up');
		expect(writes()[2]).toMatchObject({
			claims: {
				repository_id: '777',
				workflow_ref: 'Acme/web/.github/workflows/ship.yml@refs/heads/release/1.0',
				environment: 'prod-eu',
			},
		});
		expect(workflowText()).toContain('branches: ["release/1.0"]');
		expect(workflowText()).toContain('environment: "prod-eu"');
	});

	it('refuses a pasted line for another repository, and a branch it would have to escape', async () => {
		stubGitHub(404);
		renderPanel();
		await screen.findByLabelText('GitHub repository');
		type('GitHub repository', 'acme/web');
		fireEvent.change(await screen.findByLabelText('Repository id and name'), { target: { value: '777 Acme/api' } });
		submit();
		expect(await screen.findByText('That line is for Acme/api, not acme/web.')).toBeTruthy();
		type('Branch', "it's");
		submit();
		expect(await screen.findByText(/Enter a branch made of letters/)).toBeTruthy();
		expect(writes()).toEqual([]);
	});

	it('changes nothing, and says why, when a record of that name differs', async () => {
		cluster.roles = [{ role: 'web-ci-deploy', permission: { super_user: true } }];
		stubGitHub(200, { id: 42, full_name: 'Acme/web', private: false });
		renderPanel();
		await screen.findByLabelText('GitHub repository');
		type('GitHub repository', 'Acme/web');
		await screen.findByText('Acme/web, id 42.');
		submit();
		expect(await screen.findByText('Nothing was changed')).toBeTruthy();
		expect(screen.getByText('Role "web-ci-deploy" already exists and it is a super_user role.')).toBeTruthy();
		expect(writes()).toEqual([]);
		expect(console.error).not.toHaveBeenCalled();
	});

	it('shows a setup that is already there, read back from the policy', async () => {
		Object.assign(cluster, { roles: [role()], users: [user()], policies: [storedPolicy()] });
		renderPanel();
		const status = await screen.findByRole('region', { name: 'Deploy status' });
		expect(within(status).getByText('Set up')).toBeTruthy();
		expect(within(status).getByText('Acme/web')).toBeTruthy();
		expect(within(status).getByText('.github/workflows/deploy.yaml')).toBeTruthy();
		expect(workflowText()).toContain("if: github.ref == 'refs/heads/main'");
		expect(writes()).toEqual([]);
	});

	it('finishes a setup that is missing its user, creating only that', async () => {
		Object.assign(cluster, {
			roles: [role()],
			users: [],
			policies: [storedPolicy({ invalid_reason: "names user 'web-ci-deploy', which does not exist" })],
		});
		renderPanel();
		expect(await screen.findByText(/User "web-ci-deploy" is missing\./)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));
		await waitFor(() => expect(writes().map((body) => body.operation)).toEqual(['add_user']));
		expect(writes()[0]).toMatchObject({ username: 'web-ci-deploy', role: 'web-ci-deploy', active: true });
	});

	it("flags a policy for another cluster URL, or one Harper says can't match", async () => {
		Object.assign(cluster, {
			roles: [role()],
			users: [user()],
			policies: [storedPolicy({ audience: 'https://old.example.com:9925/', invalid_reason: 'is disabled' })],
		});
		renderPanel();
		const status = await screen.findByRole('region', { name: 'Deploy status' });
		expect(within(status).getByText('Needs attention')).toBeTruthy();
		expect(within(status).getByText(/audience is "https:\/\/old\.example\.com:9925\/", not "https:\/\/cluster/))
			.toBeTruthy();
		expect(within(status).getByText('Trust policy "github-actions-web" is disabled.')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Finish setup' })).toBeNull();
	});

	it.each([[400, false], [500, true]])(
		'says what was created before a %s stopped it, and reports only a server failure',
		async (status, reported) => {
			cluster.failAddUser = status;
			stubGitHub(200, { id: 42, full_name: 'Acme/web', private: false });
			renderPanel();
			await screen.findByLabelText('GitHub repository');
			type('GitHub repository', 'Acme/web');
			await screen.findByText('Acme/web, id 42.');
			submit();
			expect(await screen.findByText('Setup stopped')).toBeTruthy();
			expect(screen.getByText('Harper refused the user')).toBeTruthy();
			expect(screen.getByText('Created role web-ci-deploy.')).toBeTruthy();
			expect(screen.getByText(/Setting up again checks what is there/)).toBeTruthy();
			expect(vi.mocked(console.error).mock.calls.length > 0).toBe(reported);
		},
	);

	it("can't set up without the cluster's own URL, which the token is requested for", async () => {
		cluster.operationsUrl = undefined;
		renderPanel();
		expect(await screen.findByText(/Studio doesn't know this cluster's operations URL/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Set up deploys' })).toBeNull();
	});
});
