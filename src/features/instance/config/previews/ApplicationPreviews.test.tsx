/**
 * @vitest-environment jsdom
 */
import type { APIDirectoryEntry } from '@/integrations/api/instance/applications/getComponents';
import type { PreviewPolicy } from '@/integrations/api/instance/previews/previews';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationPreviews } from './ApplicationPreviews';

const { cluster, toast } = vi.hoisted(() => ({
	cluster: {
		operations: {} as Record<string, (body: Record<string, unknown>) => unknown>,
		calls: [] as Array<Record<string, unknown>>,
	},
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_url: string, body: Record<string, unknown>) => {
			cluster.calls.push(body);
			const handler = cluster.operations[body.operation as string];
			if (!handler) {
				throw new Error(`Unexpected operation ${String(body.operation)}`);
			}
			return { data: await handler(body) };
		},
	};
	const params = { instanceClient, entityId: 'clu-1', entityType: 'cluster' };
	return { useInstanceClientIdParams: () => params };
});
vi.mock('@tanstack/react-router', () => ({ useParams: () => ({}) }));
vi.mock('@/features/auth/store/authStore', () => ({
	authStore: { getOperationsUrl: () => 'https://cluster.example.com:9925/' },
}));
vi.mock('@/features/instance/secrets/useSecretsKeySource', () => ({
	useSecretsKeySource: (keySource: unknown) => ({ keySource, known: true, clusterInfoUnavailable: false }),
}));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/crypto/envSecret', () => ({ encryptEnvelope: async () => 'enc:v1:sealed' }));

function httpError(status: number, error: string) {
	return Object.assign(new Error(`Request failed with status code ${status}`), {
		isAxiosError: true,
		config: {},
		response: { status, data: { error } },
	});
}

const ENABLED: PreviewPolicy = {
	app: 'shop',
	enabled: true,
	role: 'shop-ci-preview',
	user: 'shop-ci-preview',
	components: 'shop-pr-*',
	repository: 'acme/shop',
	workflow: '.github/workflows/preview.yaml',
	branch: 'main',
	repository_id: '123',
	environment: 'preview',
	cleanupEnvironment: 'preview-cleanup',
	audience: 'https://cluster.example.com:9925/',
	grant: {
		names: ['shop-pr-*'],
		constraints: {
			isolated: true,
			hostSuffix: '.app.cluster.example.com',
			branchedDatabases: 'required',
			preview: 'required',
			maxPreviews: 3,
			maxTtlDays: 7,
		},
	},
	operations: ['deploy_component', 'drop_component'],
	trust: [],
	problems: [],
};

const NEVER_ENABLED: PreviewPolicy = {
	...ENABLED,
	enabled: false,
	repository: undefined,
	branch: undefined,
	audience: undefined,
	grant: null,
	operations: null,
	problems: ['role "shop-ci-preview" is missing', 'user "shop-ci-preview" is missing'],
};

/** Left by a disable that stopped: the role is there, and the policies are gone. */
const REVOKED: PreviewPolicy = {
	...ENABLED,
	enabled: false,
	repository: undefined,
	branch: undefined,
	audience: undefined,
	problems: ['user "shop-ci-preview" is inactive', 'trust policy "github-actions-shop-preview" is missing'],
};

const TREE = {
	name: 'components',
	entries: [
		{ name: 'shop', entries: [] },
		{
			name: 'shop-pr-3',
			host: 'feature.app.cluster.example.com',
			entries: [],
			preview: {
				app: 'shop',
				pr: 3,
				repository: 'acme/shop',
				branch: 'feature',
				sha: '0123456789abcdef0123456789abcdef01234567',
				expiresAt: '2026-11-04T16:37:14.744Z',
			},
		},
		{ name: 'other-pr-9', entries: [], preview: { app: 'other', pr: 9 } },
	],
} as unknown as APIDirectoryEntry;

function renderPanel({ policy, tree = TREE }: { policy: PreviewPolicy; tree?: APIDirectoryEntry }) {
	cluster.operations.get_preview_policy = () => policy;
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
	});
	render(
		<QueryClientProvider client={queryClient}>
			<ApplicationPreviews app="shop" tree={tree} />
		</QueryClientProvider>,
	);
}

const previewSwitch = () => screen.findByRole('switch', { name: 'Previews of shop' });

beforeEach(() => {
	cluster.calls.length = 0;
	cluster.operations = {
		list_secrets: () => ({ secrets: [], custody_fingerprint: null }),
		get_secrets_public_key: () => ({ public_key: 'key', fingerprint: 'print' }),
	};
	vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('ApplicationPreviews', () => {
	describe('before previews are on', () => {
		it('shows the toggle off and no problems, though Harper reports every record missing', async () => {
			renderPanel({ policy: NEVER_ENABLED, tree: { name: 'components', entries: [] } as never });
			expect((await previewSwitch()).getAttribute('aria-checked')).toBe('false');
			expect(screen.queryByText(/is missing/)).toBeNull();
			expect(screen.queryByRole('form', { name: 'Enable previews' })).toBeNull();
			expect(screen.queryByText('Live previews')).toBeNull();
		});

		it('asks for the inputs and warns about the site when the toggle goes on', async () => {
			renderPanel({ policy: NEVER_ENABLED });
			fireEvent.click(await previewSwitch());
			expect(screen.getByRole('form', { name: 'Enable previews' })).toBeTruthy();
			expect(screen.getByText('Previews are the same site as production')).toBeTruthy();
		});

		it('still lists a preview that outlived its policy, so it can be deleted', async () => {
			renderPanel({ policy: NEVER_ENABLED });
			await previewSwitch();
			expect(screen.getByRole('button', { name: 'Delete shop-pr-3' })).toBeTruthy();
		});
	});

	describe('once they are on', () => {
		it('shows the status from the policy', async () => {
			renderPanel({ policy: ENABLED });
			const status = within(await screen.findByRole('region', { name: 'Preview status' }));
			expect(status.getByText('Enabled')).toBeTruthy();
			expect(status.getByRole('link', { name: 'acme/shop' }).getAttribute('href')).toBe(
				'https://github.com/acme/shop',
			);
			expect(status.getByText('3')).toBeTruthy();
			expect(status.getByText('7 days')).toBeTruthy();
			expect(status.getByText('*.app.cluster.example.com')).toBeTruthy();
		});

		it('warns about shared data only in shared mode', async () => {
			renderPanel({ policy: ENABLED });
			await previewSwitch();
			expect(screen.queryByText("Previews share this cluster's data")).toBeNull();
			cleanup();
			renderPanel({
				policy: { ...ENABLED, grant: { names: ['shop-pr-*'], constraints: { hostSuffix: '.app.example.com' } } },
			});
			expect(await screen.findByText("Previews share this cluster's data")).toBeTruthy();
		});

		it("shows what to commit, with the audience as the variable's value", async () => {
			renderPanel({ policy: ENABLED });
			const section = within(await screen.findByRole('region', { name: 'What to commit' }));
			expect(section.getByText('HARPER_PREVIEW_TARGET')).toBeTruthy();
			expect(section.getByText('https://cluster.example.com:9925/')).toBeTruthy();
			expect(section.getByText('.github/workflows/preview.yaml')).toBeTruthy();
			expect(section.getAllByText('preview-cleanup').length).toBeGreaterThan(0);
			expect(section.getByText(/pull_request_target:/).textContent).not.toContain('domain=');
		});

		it('writes a domain into the workflow only when it is not the default for the audience', async () => {
			renderPanel({
				policy: {
					...ENABLED,
					grant: { names: ['shop-pr-*'], constraints: { hostSuffix: '.apps.acme.dev', branchedDatabases: 'required' } },
				},
			});
			const section = within(await screen.findByRole('region', { name: 'What to commit' }));
			expect(section.getByText(/pull_request_target:/).textContent).toContain('domain=apps.acme.dev');
		});

		it("lists this application's previews, not another's", async () => {
			renderPanel({ policy: ENABLED });
			const live = within(await screen.findByRole('region', { name: 'Live previews' }));
			expect(live.getByRole('link', { name: '#3' }).getAttribute('href')).toBe('https://github.com/acme/shop/pull/3');
			expect(live.getByRole('link', { name: '0123456789ab' })).toBeTruthy();
			expect(live.getByRole('link', { name: 'https://feature.app.cluster.example.com/' })).toBeTruthy();
			expect(live.getByText('feature')).toBeTruthy();
			expect(live.queryByRole('button', { name: 'Delete other-pr-9' })).toBeNull();
		});

		it('builds no GitHub link from a repository that is not one', async () => {
			const tree = {
				name: 'components',
				entries: [{
					name: 'shop-pr-3',
					entries: [],
					preview: { app: 'shop', pr: 3, repository: 'javascript:alert(1)//x/y', sha: 'abc' },
				}],
			} as unknown as APIDirectoryEntry;
			renderPanel({ policy: ENABLED, tree });
			const live = within(await screen.findByRole('region', { name: 'Live previews' }));
			expect(live.queryByRole('link')).toBeNull();
			expect(live.getByText('#3')).toBeTruthy();
		});
	});

	describe('a setup with problems', () => {
		it('shows each problem and offers the disable that resumes', async () => {
			renderPanel({ policy: REVOKED });
			const status = within(await screen.findByRole('region', { name: 'Preview status' }));
			expect(status.getByText('Needs attention')).toBeTruthy();
			expect(status.getByText('user "shop-ci-preview" is inactive')).toBeTruthy();
			expect(status.getByText('trust policy "github-actions-shop-preview" is missing')).toBeTruthy();
			expect(status.getByRole('button', { name: 'Disable previews' })).toBeTruthy();
			expect(screen.queryByRole('region', { name: 'What to commit' })).toBeNull();
		});
	});

	describe('deleting a preview', () => {
		const deleteIt = async () => {
			fireEvent.click(await screen.findByRole('button', { name: 'Delete shop-pr-3' }));
			fireEvent.click(await screen.findByRole('button', { name: /^Drop$/ }));
		};

		it("sends the drop for that preview and shows each node's result", async () => {
			cluster.operations.drop_component = () => ({
				message: 'Successfully dropped: shop-pr-3',
				replicated: [{ node: 'node-2', message: 'Successfully dropped: shop-pr-3', requestId: 1 }],
			});
			renderPanel({ policy: ENABLED });
			await deleteIt();
			const live = within(await screen.findByRole('region', { name: 'Live previews' }));
			expect(await live.findByText('Dropped shop-pr-3')).toBeTruthy();
			expect(live.getByText('node-2: Successfully dropped: shop-pr-3')).toBeTruthy();
			expect(cluster.calls).toContainEqual({ operation: 'drop_component', project: 'shop-pr-3', replicated: true });
		});

		it('says so when a peer still holds it, and names why', async () => {
			cluster.operations.drop_component = () => ({
				message: 'Successfully dropped: shop-pr-3',
				replicated: [{ node: 'node-2', reason: 'timed out', status: 'failed' }],
			});
			renderPanel({ policy: ENABLED });
			await deleteIt();
			expect(await screen.findByText('shop-pr-3 was not fully dropped')).toBeTruthy();
			expect(screen.getByText('node-2: failed: timed out')).toBeTruthy();
		});

		it('shows a refused drop as Harper worded it, in place of a toast', async () => {
			cluster.operations.drop_component = () => {
				throw httpError(409, 'A deploy of shop-pr-3 is in progress');
			};
			renderPanel({ policy: ENABLED });
			await deleteIt();
			expect(await screen.findByText('A deploy of shop-pr-3 is in progress')).toBeTruthy();
			expect(toast.error).not.toHaveBeenCalled();
			expect(console.error).not.toHaveBeenCalled();
		});
	});

	describe('disabling', () => {
		const confirmDisable = async () => {
			fireEvent.click(await previewSwitch());
			const dialog = within(await screen.findByRole('dialog'));
			expect(dialog.getByText(/revokes the CI identity/)).toBeTruthy();
			expect(dialog.getByText(/drops every preview of shop/)).toBeTruthy();
			fireEvent.click(dialog.getByRole('button', { name: 'Disable previews' }));
		};

		it('asks first, and calls nothing until confirmed', async () => {
			renderPanel({ policy: ENABLED });
			fireEvent.click(await previewSwitch());
			await screen.findByRole('dialog');
			fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
			expect(cluster.calls.map((call) => call.operation)).not.toContain('disable_previews');
		});

		it('reports what was dropped and removed, and what was still deploying', async () => {
			let policy = ENABLED;
			cluster.operations.disable_previews = () => {
				policy = NEVER_ENABLED;
				return {
					message: 'Disabled previews of shop',
					app: 'shop',
					dropped: [
						{ node: 'node-1', project: 'shop-pr-3', deploymentId: 'd1', componentRemoved: true },
						{ node: 'node-2', project: 'shop-pr-3', deploymentId: 'd1', componentRemoved: false },
					],
					removed: ['user shop-ci-preview', 'role shop-ci-preview'],
					inProgress: ['shop-pr-4'],
				};
			};
			renderPanel({ policy });
			cluster.operations.get_preview_policy = () => policy;
			await confirmDisable();
			expect(await screen.findByText('Disabled previews of shop')).toBeTruthy();
			expect(screen.getByText('shop-pr-3 on node-1: dropped')).toBeTruthy();
			expect(screen.getByText('shop-pr-3 on node-2: did not hold it')).toBeTruthy();
			expect(screen.getByText('Removed user shop-ci-preview, role shop-ci-preview.')).toBeTruthy();
			expect(screen.getByText(/Still deploying when previews were revoked: shop-pr-4/)).toBeTruthy();
			await waitFor(async () => expect((await previewSwitch()).getAttribute('aria-checked')).toBe('false'));
		});

		it('says why it stopped and offers the rerun, which resumes', async () => {
			let policy = ENABLED;
			const stopped = 'Previews of shop are revoked but not removed: shop-pr-3 on node-2: EPERM.';
			cluster.operations.disable_previews = () => {
				policy = REVOKED;
				throw httpError(500, stopped);
			};
			renderPanel({ policy });
			cluster.operations.get_preview_policy = () => policy;
			await confirmDisable();
			expect(await screen.findByText(stopped)).toBeTruthy();
			// Refetched despite the failure: the identity is gone, and the page has to say so.
			expect(await screen.findByText('user "shop-ci-preview" is inactive')).toBeTruthy();
			expect(console.error).toHaveBeenCalled();

			cluster.operations.disable_previews = () => {
				policy = NEVER_ENABLED;
				return { message: 'Disabled previews of shop', app: 'shop', dropped: [], removed: ['role shop-ci-preview'] };
			};
			fireEvent.click(screen.getByRole('button', { name: 'Run disable again' }));
			expect(await screen.findByText('Disabled previews of shop')).toBeTruthy();
			expect(screen.queryByText(stopped)).toBeNull();
			expect(cluster.calls.filter((call) => call.operation === 'disable_previews')).toHaveLength(2);
		});

		it('does not call an unanswered disable a failure of the drops, and still offers the rerun', async () => {
			cluster.operations.disable_previews = () => {
				throw Object.assign(new Error('timeout'), { isAxiosError: true, code: 'ECONNABORTED', config: {} });
			};
			renderPanel({ policy: ENABLED });
			await confirmDisable();
			expect(await screen.findByRole('button', { name: 'Run disable again' })).toBeTruthy();
		});
	});

	describe('the GitHub token', () => {
		const secret = {
			name: 'deploy.shop-pr-_.git.github.com',
			grants: ['shop-pr-*'],
		};
		const publicRepository = () =>
			vi.stubGlobal(
				'fetch',
				vi.fn(async () =>
					new Response(JSON.stringify({ id: 123, full_name: 'acme/shop', private: false }), { status: 200 })
				),
			);

		it('is not asked for on a public repository', async () => {
			publicRepository();
			renderPanel({ policy: ENABLED });
			await screen.findByRole('region', { name: 'What to commit' });
			await waitFor(() => expect(fetch).toHaveBeenCalled());
			expect(screen.queryByRole('region', { name: 'GitHub token' })).toBeNull();
			expect(cluster.calls.map((call) => call.operation)).not.toContain('get_secrets_public_key');
		});

		it("is asked for when GitHub cannot see the repository, and can't be read back", async () => {
			renderPanel({ policy: ENABLED });
			const section = within(await screen.findByRole('region', { name: 'GitHub token' }));
			expect(section.getByText('Not set')).toBeTruthy();
			expect(section.getByLabelText('Fine-grained token').getAttribute('type')).toBe('password');
		});

		it('says so when the cluster has no key to seal it with', async () => {
			cluster.operations.get_secrets_public_key = () => {
				throw httpError(400, 'secrets custody is not initialized on this node');
			};
			renderPanel({ policy: ENABLED });
			expect(await screen.findByText(/has no secrets key/)).toBeTruthy();
			expect(screen.queryByLabelText('Fine-grained token')).toBeNull();
		});

		it('marks the workflow once a token is sealed for every preview of the application', async () => {
			cluster.operations.list_secrets = () => ({ secrets: [secret], custody_fingerprint: 'print' });
			renderPanel({ policy: ENABLED });
			const section = within(await screen.findByRole('region', { name: 'GitHub token' }));
			expect(await section.findByText('Sealed')).toBeTruthy();
			const workflow = within(screen.getByRole('region', { name: 'What to commit' }));
			expect(workflow.getByText(/pull_request_target:/).textContent).toContain('credential=true');
		});

		const sealToken = async () => {
			const field = await screen.findByLabelText('Fine-grained token');
			fireEvent.change(field, { target: { value: ' github_pat_plaintext ' } });
			fireEvent.click(screen.getByRole('button', { name: 'Seal token' }));
			return field as HTMLInputElement;
		};

		it('seals it in the browser, then grants it to every preview, in two calls as the CLI does', async () => {
			cluster.operations.set_secret = () => ({ name: secret.name, kid: 'print', created: true });
			cluster.operations.grant_secret = () => ({ name: secret.name, grants: secret.grants, changed: true });
			renderPanel({ policy: ENABLED });
			const field = await sealToken();
			await waitFor(() => expect(field.value).toBe(''));
			const writes = cluster.calls.filter((call) => (call.operation as string).endsWith('_secret'));
			expect(writes).toEqual([
				{ operation: 'set_secret', name: secret.name, envelope: 'enc:v1:sealed', processEnv: false },
				{ operation: 'grant_secret', name: secret.name, component: 'shop-pr-*' },
			]);
			expect(JSON.stringify(cluster.calls)).not.toContain('github_pat_plaintext');
		});

		it('keeps the token in the field when sealing fails, to try again', async () => {
			cluster.operations.set_secret = () => {
				throw httpError(400, 'The envelope is malformed');
			};
			renderPanel({ policy: ENABLED });
			const field = await sealToken();
			await waitFor(() => expect(toast.error).toHaveBeenCalled());
			expect(field.value).toBe(' github_pat_plaintext ');
			expect(cluster.calls.map((call) => call.operation)).not.toContain('grant_secret');
		});

		it('does not take a secret granted to something else for it', async () => {
			cluster.operations.list_secrets = () => ({
				secrets: [{ ...secret, grants: ['another-component'] }],
				custody_fingerprint: 'print',
			});
			renderPanel({ policy: ENABLED });
			const section = within(await screen.findByRole('region', { name: 'GitHub token' }));
			expect(section.getByText('Not set')).toBeTruthy();
		});
	});
});
