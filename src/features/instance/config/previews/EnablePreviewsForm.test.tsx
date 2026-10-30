/**
 * @vitest-environment jsdom
 */
import { mutationErrorHandler } from '@/react-query/queryClient';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEnablePreviewsRequest, EnablePreviewsForm } from './EnablePreviewsForm';

const { state, post, toast } = vi.hoisted(() => ({
	state: { operationsUrl: 'https://cluster.example.com:9925/' as string | undefined },
	post: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/config/useInstanceClient', () => {
	const params = { instanceClient: { post }, entityId: 'clu-1', entityType: 'cluster' };
	return { useInstanceClientIdParams: () => params };
});
vi.mock('@/features/auth/store/authStore', () => ({
	authStore: { getOperationsUrl: () => state.operationsUrl },
}));
vi.mock('@tanstack/react-router', () => ({ useParams: () => ({}) }));
vi.mock('sonner', () => ({ toast }));

function httpError(status: number, error: string) {
	return Object.assign(new Error(`Request failed with status code ${status}`), {
		isAxiosError: true,
		config: {},
		response: { status, data: { error } },
	});
}

function stubGitHub(status: number, body: unknown = {}) {
	vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

const FOUND = { id: 219919692, full_name: 'HarperFast/studio', private: false, default_branch: 'stage' };

const onEnabled = vi.fn();

function renderForm() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
	});
	render(
		<QueryClientProvider client={queryClient}>
			<EnablePreviewsForm app="shop" onEnabled={onEnabled} />
		</QueryClientProvider>,
	);
}

const repositoryField = () => screen.getByLabelText('GitHub repository') as HTMLInputElement;
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Enable previews' }));
const enableRequest = () => post.mock.calls[0]?.[1];

beforeEach(() => {
	state.operationsUrl = 'https://cluster.example.com:9925/';
	post.mockReset();
	post.mockResolvedValue({ data: { message: 'Enabled previews of shop', created: [] } });
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('EnablePreviewsForm', () => {
	it('defaults to branched data, a week, and main', () => {
		stubGitHub(404);
		renderForm();
		expect((screen.getByLabelText('Branch') as HTMLInputElement).value).toBe('main');
		expect((screen.getByLabelText('Longest life, in days') as HTMLInputElement).value).toBe('7');
		expect(screen.getByRole('radio', { name: /^Branched/ }).getAttribute('aria-checked')).toBe('true');
	});

	it("sends GitHub's spelling, id and default branch for what was typed", async () => {
		stubGitHub(200, FOUND);
		renderForm();
		type(repositoryField(), 'https://github.com/harperfast/studio.git');
		expect(await screen.findByText('HarperFast/studio, id 219919692.')).toBeTruthy();
		await waitFor(() => expect((screen.getByLabelText('Branch') as HTMLInputElement).value).toBe('stage'));
		submit();
		await waitFor(() => expect(post).toHaveBeenCalled());
		expect(enableRequest()).toEqual({
			operation: 'enable_previews',
			app: 'shop',
			repository: 'HarperFast/studio',
			repository_id: '219919692',
			branch: 'stage',
			audience: 'https://cluster.example.com:9925/',
			dataMode: 'branched',
			maxTtlDays: 7,
		});
		await waitFor(() => expect(onEnabled).toHaveBeenCalled());
		expect(toast.success).toHaveBeenCalledWith('Enabled previews of shop');
	});

	it('leaves a branch someone typed alone when the lookup lands', async () => {
		stubGitHub(200, FOUND);
		renderForm();
		type(screen.getByLabelText('Branch'), 'trunk');
		type(repositoryField(), 'HarperFast/studio');
		await screen.findByText('HarperFast/studio, id 219919692.');
		expect((screen.getByLabelText('Branch') as HTMLInputElement).value).toBe('trunk');
	});

	it("asks for the id when GitHub can't see the repository, and refuses to go without it", async () => {
		stubGitHub(404, { message: 'Not Found' });
		renderForm();
		type(repositoryField(), 'acme/private');
		const idField = await screen.findByLabelText('Repository id');
		expect(screen.getByText(/enter its id below/)).toBeTruthy();
		expect(screen.getByText("gh api repos/acme/private --jq '.id, .full_name'")).toBeTruthy();
		submit();
		expect(await screen.findByText('Enter the numeric id.')).toBeTruthy();
		expect(post).not.toHaveBeenCalled();

		type(idField, '123456');
		submit();
		await waitFor(() => expect(post).toHaveBeenCalled());
		expect(enableRequest()).toMatchObject({ repository: 'acme/private', repository_id: '123456' });
	});

	const stubBothRepositories = () =>
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) =>
				url.endsWith('/acme/private')
					? new Response('{}', { status: 404 })
					: new Response(JSON.stringify(FOUND), { status: 200 })
			),
		);

	it('drops an id left behind by a repository that turned out not to need one', async () => {
		stubBothRepositories();
		renderForm();
		type(repositoryField(), 'acme/private');
		type(await screen.findByLabelText('Repository id'), 'not-a-number');
		type(repositoryField(), 'HarperFast/studio');
		await screen.findByText('HarperFast/studio, id 219919692.');
		submit();
		await waitFor(() => expect(post).toHaveBeenCalled());
		expect(enableRequest()).toMatchObject({ repository_id: '219919692' });
	});

	it('goes back to main when the next repository has no default branch to offer', async () => {
		stubBothRepositories();
		renderForm();
		type(repositoryField(), 'HarperFast/studio');
		await waitFor(() => expect((screen.getByLabelText('Branch') as HTMLInputElement).value).toBe('stage'));
		type(repositoryField(), 'acme/private');
		await screen.findByLabelText('Repository id');
		await waitFor(() => expect((screen.getByLabelText('Branch') as HTMLInputElement).value).toBe('main'));
	});

	it("does not call the name wrong when GitHub's rate limit answered", async () => {
		stubGitHub(403);
		renderForm();
		type(repositoryField(), 'acme/shop');
		expect(await screen.findByText(/limit on lookups/)).toBeTruthy();
		expect(screen.getByLabelText('Repository id')).toBeTruthy();
	});

	it('refuses what is not a repository, or an answer it is still waiting for', async () => {
		vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
		renderForm();
		type(repositoryField(), 'not a repository');
		submit();
		expect(await screen.findByText('Enter the repository as owner/name.')).toBeTruthy();
		type(repositoryField(), 'acme/shop');
		submit();
		expect(await screen.findByText(/Still looking acme\/shop up/)).toBeTruthy();
		expect(post).not.toHaveBeenCalled();
	});

	it('warns about shared data, and sends the limits as numbers', async () => {
		stubGitHub(200, FOUND);
		renderForm();
		type(repositoryField(), 'HarperFast/studio');
		await screen.findByText('HarperFast/studio, id 219919692.');
		expect(screen.queryByText("Previews share this cluster's data")).toBeNull();
		fireEvent.click(screen.getByRole('radio', { name: /^Shared/ }));
		expect(await screen.findByText("Previews share this cluster's data")).toBeTruthy();
		type(screen.getByLabelText('Most previews at once'), '5');
		type(screen.getByLabelText('Longest life, in days'), '2.5');
		submit();
		await waitFor(() => expect(post).toHaveBeenCalled());
		expect(enableRequest()).toMatchObject({ dataMode: 'shared', maxPreviews: 5, maxTtlDays: 2.5 });
	});

	it('refuses limits Harper would', async () => {
		stubGitHub(200, FOUND);
		renderForm();
		type(repositoryField(), 'HarperFast/studio');
		await screen.findByText('HarperFast/studio, id 219919692.');
		type(screen.getByLabelText('Most previews at once'), '1.5');
		type(screen.getByLabelText('Longest life, in days'), '0');
		submit();
		expect(await screen.findByText(/whole number above zero/)).toBeTruthy();
		expect(screen.getByText(/number of days above zero/)).toBeTruthy();
		expect(post).not.toHaveBeenCalled();
	});

	it("asks for a preview domain only when the cluster's URL is not a host name", async () => {
		stubGitHub(200, FOUND);
		renderForm();
		expect(screen.queryByLabelText('Preview domain')).toBeNull();
		cleanup();

		state.operationsUrl = 'http://localhost:9925';
		renderForm();
		type(repositoryField(), 'HarperFast/studio');
		await screen.findByText('HarperFast/studio, id 219919692.');
		submit();
		expect(await screen.findByText('Enter the domain previews are served under.')).toBeTruthy();
		type(screen.getByLabelText('Preview domain'), '.app.example.com');
		submit();
		await waitFor(() => expect(post).toHaveBeenCalled());
		expect(enableRequest()).toMatchObject({
			audience: 'http://localhost:9925/',
			hostSuffix: '.app.example.com',
		});
	});

	it("shows Harper's 409 as it comes, in the form, with no toast and no error report", async () => {
		const conflict = 'Nothing was changed.\n  - Trust policy "x" would also match the runs "y" is for.';
		stubGitHub(200, FOUND);
		post.mockRejectedValue(httpError(409, conflict));
		renderForm();
		type(repositoryField(), 'HarperFast/studio');
		await screen.findByText('HarperFast/studio, id 219919692.');
		submit();
		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toBe(conflict);
		expect(toast.error).not.toHaveBeenCalled();
		expect(console.error).not.toHaveBeenCalled();
		expect(onEnabled).not.toHaveBeenCalled();
	});

	it('still reports a server error, which is not an answer about the request', async () => {
		stubGitHub(200, FOUND);
		post.mockRejectedValue(httpError(500, 'Previews of shop did not verify'));
		renderForm();
		type(repositoryField(), 'HarperFast/studio');
		await screen.findByText('HarperFast/studio, id 219919692.');
		submit();
		await screen.findByRole('alert');
		expect(console.error).toHaveBeenCalled();
	});

	it("never falls back to Studio's own host, which no token is requested for", () => {
		stubGitHub(404);
		state.operationsUrl = undefined;
		renderForm();
		expect(screen.getByText(/doesn't know this cluster's operations URL/)).toBeTruthy();
	});

	it('refuses to set up what CI could never match, when there is no operations URL', () => {
		stubGitHub(404);
		state.operationsUrl = 'https://stage.studio.harperfabric.com/Cluster/clu-1/operation';
		renderForm();
		expect(screen.getByText(/doesn't know this cluster's operations URL/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Enable previews' })).toBeNull();
	});
});

describe('buildEnablePreviewsRequest', () => {
	const values = {
		repository: 'x',
		repositoryId: '',
		branch: 'main',
		dataMode: 'branched' as const,
		maxPreviews: '',
		maxTtlDays: '7',
		hostSuffix: '',
	};
	const context = {
		app: 'shop',
		repository: 'acme/shop',
		repositoryId: '1',
		audience: 'https://cluster.example.com:9925/',
		needsHostSuffix: false,
	};

	it('leaves out an empty cap, and a suffix the audience already gives', () => {
		const request = buildEnablePreviewsRequest({ ...values, hostSuffix: 'ignored' }, context);
		expect(request).not.toHaveProperty('maxPreviews');
		expect(request).not.toHaveProperty('hostSuffix');
	});

	it('gives a suffix its leading dot, however it was typed', () => {
		for (const hostSuffix of ['app.example.com', '.app.example.com', '..app.example.com']) {
			expect(buildEnablePreviewsRequest({ ...values, hostSuffix }, { ...context, needsHostSuffix: true }).hostSuffix)
				.toBe('.app.example.com');
		}
	});
});
