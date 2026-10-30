import type { APIDirectoryEntry } from '@/integrations/api/instance/applications/getComponents';
import { rejectReplicationFailures } from '@/integrations/api/replication';
import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
	disablePreviews,
	dropPreview,
	enablePreviews,
	livePreviewsOf,
	previewableApplications,
	previewCredentialSecretName,
	previewExpiresAtMs,
	PreviewPolicy,
	previewSetupState,
	supportsPreviews,
} from './previews';

function instanceClient(data: unknown = { message: 'ok' }) {
	const post = vi.fn(async () => ({ data }));
	return { post, client: { post } as unknown as AxiosInstance };
}

const NEVER_ENABLED: PreviewPolicy = {
	app: 'shop',
	enabled: false,
	role: 'shop-ci-preview',
	user: 'shop-ci-preview',
	components: 'shop-pr-*',
	grant: null,
	operations: null,
	trust: [],
	problems: [
		'role "shop-ci-preview" is missing',
		'user "shop-ci-preview" is missing',
		'trust policy "github-actions-shop-preview" is missing',
		'trust policy "github-actions-shop-preview-cleanup" is missing',
	],
};

describe('supportsPreviews', () => {
	it.each([
		['5.4.0-alpha.2', true],
		['5.4.0-beta.1', true],
		['5.4.0', true],
		['5.4.3', true],
		['6.0.0', true],
	])('offers previews on %s', (version, expected) => {
		expect(supportsPreviews(version)).toBe(expected);
	});

	it.each(['5.3.4', '5.3.0', '4.7.40', '5.4.0-alpha.1', undefined])(
		'does not offer them on %s, which has no such operations',
		(version) => {
			expect(supportsPreviews(version)).toBe(false);
		},
	);
});

describe('previewCredentialSecretName', () => {
	// `deriveGitSecretName('shop-pr-*', 'github.com')`, run against a build of harper main.
	it('is the name `harper preview deploy credential=true` reads', () => {
		expect(previewCredentialSecretName('shop')).toBe('deploy.shop-pr-_.git.github.com');
	});
});

describe('previewSetupState', () => {
	it('reads the four missing records of an application that never had previews as off', () => {
		expect(previewSetupState(NEVER_ENABLED)).toBe('off');
	});

	it('is on only when Harper says so', () => {
		expect(previewSetupState({ ...NEVER_ENABLED, enabled: true, problems: [] })).toBe('on');
	});

	it('reads a disable that stopped partway as incomplete: the role is left, and the policies are gone', () => {
		expect(previewSetupState({
			...NEVER_ENABLED,
			grant: { names: ['shop-pr-*'] },
			problems: [
				'user "shop-ci-preview" is inactive',
				'trust policy "github-actions-shop-preview" is missing',
				'trust policy "github-actions-shop-preview-cleanup" is missing',
			],
		})).toBe('incomplete');
	});

	it('reads a role someone else owns as incomplete, not as nothing there', () => {
		expect(previewSetupState({
			...NEVER_ENABLED,
			problems: ['role "shop-ci-preview" is not a preview role for shop-pr-* alone'],
		})).toBe('incomplete');
	});
});

describe('the operations', () => {
	it('sends enable_previews with the request as given', async () => {
		const { post, client } = instanceClient();
		const request = {
			app: 'shop',
			repository: 'acme/shop',
			repository_id: '123',
			branch: 'main',
			audience: 'https://cluster.example.com:9925/',
			dataMode: 'branched' as const,
			maxTtlDays: 7,
		};
		await enablePreviews({ instanceClient: client, request });
		expect(post).toHaveBeenCalledWith('/', { operation: 'enable_previews', ...request });
	});

	it("gives disable_previews far longer than the client's 60 seconds, since it drops every preview", async () => {
		const { post, client } = instanceClient();
		await disablePreviews({ instanceClient: client, app: 'shop' });
		expect(post).toHaveBeenCalledWith('/', { operation: 'disable_previews', app: 'shop' }, { timeout: 600_000 });
	});

	it("outwaits Harper's 5 minutes for a peer, so a hung peer comes back as that peer's result", async () => {
		const { post, client } = instanceClient();
		await dropPreview({ instanceClient: client, project: 'shop-pr-3', replicated: true });
		const [, , config] = post.mock.calls[0] as unknown as [string, unknown, { timeout: number }];
		expect(config.timeout).toBeGreaterThan(5 * 60_000);
	});

	it("sends a drop as told, and keeps each peer's result", async () => {
		const { post, client } = instanceClient();
		await dropPreview({ instanceClient: client, project: 'shop-pr-3', replicated: true });
		await dropPreview({ instanceClient: client, project: 'shop-pr-3', replicated: false });
		expect(post).toHaveBeenNthCalledWith(
			1,
			'/',
			{ operation: 'drop_component', project: 'shop-pr-3', replicated: true },
			expect.objectContaining({ keepReplicationFailures: true }),
		);
		expect(post).toHaveBeenNthCalledWith(
			2,
			'/',
			{ operation: 'drop_component', project: 'shop-pr-3', replicated: false },
			expect.objectContaining({ keepReplicationFailures: true }),
		);
	});

	it("lets a drop's failed peer through the interceptor, which rejects it for everything else", async () => {
		const data = {
			message: 'Successfully dropped: shop-pr-3',
			replicated: [{ node: 'node-2', reason: 'timed out', status: 'failed' as const }],
		};
		await expect(rejectReplicationFailures({ data })).rejects.toContain('node-2: timed out');
		expect(rejectReplicationFailures({ data, config: { keepReplicationFailures: true } })).toEqual({
			data,
			config: { keepReplicationFailures: true },
		});
	});
});

describe('reading get_components', () => {
	const tree = {
		name: 'components',
		entries: [
			{ name: 'zeta', entries: [] },
			{ name: 'shop', entries: [] },
			{ name: 'shop-pr-3', host: 'a.app.example.com', entries: [], preview: { app: 'shop', pr: 3 } },
			{ name: 'shop-pr-12', host: 'b.app.example.com', entries: [], preview: { app: 'shop', pr: 12 } },
			{ name: 'other-pr-1', entries: [], preview: { app: 'other', pr: 1 } },
			{ name: 'shop-pr-notes', entries: [] },
			{ name: 'README.md' },
		],
	} as unknown as APIDirectoryEntry;

	it("lists this application's previews by their metadata, most recent PR first", () => {
		expect(livePreviewsOf(tree, 'shop').map((live) => [live.project, live.host])).toEqual([
			['shop-pr-12', 'b.app.example.com'],
			['shop-pr-3', 'a.app.example.com'],
		]);
	});

	it('does not take a component named like a preview for one', () => {
		expect(livePreviewsOf(tree, 'shop').map((live) => live.project)).not.toContain('shop-pr-notes');
	});

	it('offers every application except the previews themselves', () => {
		expect(previewableApplications(tree)).toEqual(['shop', 'shop-pr-notes', 'zeta']);
	});

	it('is empty before the tree has loaded', () => {
		expect(livePreviewsOf(undefined, 'shop')).toEqual([]);
		expect(previewableApplications(undefined)).toEqual([]);
	});
});

describe('previewExpiresAtMs', () => {
	it('reads ISO 8601 and epoch milliseconds, and nothing else', () => {
		const ms = Date.UTC(2026, 10, 4);
		expect(previewExpiresAtMs({ app: 'a', pr: 1, expiresAt: new Date(ms).toISOString() })).toBe(ms);
		expect(previewExpiresAtMs({ app: 'a', pr: 1, expiresAt: ms })).toBe(ms);
		expect(previewExpiresAtMs({ app: 'a', pr: 1, expiresAt: 'soon' })).toBeUndefined();
		expect(previewExpiresAtMs({ app: 'a', pr: 1 })).toBeUndefined();
	});
});
