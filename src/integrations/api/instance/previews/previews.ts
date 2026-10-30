/**
 * PR previews (Harper 5.4+, HarperFast/harper#3617): the cluster owns them, so Studio calls it as the signed-in super
 * user. `enable_previews`, `disable_previews` and `get_preview_policy` enforce super_user in their handlers. The names
 * and claims are Harper's (`utility/previewIdentity.ts`), and what enable writes is in its `security/DESIGN.md`.
 */
import { InstanceClientConfig, InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { APIDirectoryEntry, PreviewMetadata } from '@/integrations/api/instance/applications/getComponents';
import { OidcTrustPolicy } from '@/integrations/api/instance/oidcTrust/oidcTrust';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { queryOptions, useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

/**
 * The first tagged build that can hold these operations. 5.4.0-alpha.1 cannot: it was cut from `e942ebef8`, before
 * harper#3617 merged as `4ed1155ed`, and the operations are absent from what npm serves as that version.
 */
export const PREVIEWS_MIN_VERSION = '5.4.0-alpha.2';

export function supportsPreviews(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(PREVIEWS_MIN_VERSION, version);
}

/** Harper walks each node's preview releases and drops them one by one, up to 5 minutes for a peer. */
const DISABLE_PREVIEWS_TIMEOUT_MS = 10 * 60_000;
/** Harper's own limit for dropping a release on a peer. */
const DROP_PREVIEW_TIMEOUT_MS = 5 * 60_000;

export function previewComponentPattern(app: string): string {
	return `${app}-pr-*`;
}

/**
 * The secret `harper preview deploy credential=true` reads for a repository on github.com. Harper derives the name in
 * `deriveGitSecretName` (`utility/componentNames.ts`), and the two have to agree or the deploy finds nothing.
 */
export function previewCredentialSecretName(app: string): string {
	const component = previewComponentPattern(app).replace(/[^\w.-]+/g, '_');
	return `deploy.${component}.git.github.com`;
}

export interface PreviewGrant {
	names?: string[];
	constraints?: {
		isolated?: boolean;
		hostSuffix?: string;
		/** `required` when previews get their own database branches. Absent for `shared`. */
		branchedDatabases?: string;
		preview?: string;
		maxPreviews?: number;
		maxTtlDays?: number;
	};
}

export interface PreviewPolicy {
	app: string;
	/** Only when every record is present and intact. */
	enabled: boolean;
	role: string;
	user: string;
	components: string;
	repository?: string;
	workflow?: string;
	branch?: string;
	repository_id?: string;
	environment?: string;
	cleanupEnvironment?: string;
	audience?: string;
	grant: PreviewGrant | null;
	operations: string[] | null;
	trust: OidcTrustPolicy[];
	problems: string[];
}

export type PreviewSetupState = 'off' | 'on' | 'incomplete';

/**
 * `problems` lists every missing record, so an application that never had previews reads as four problems. Anything
 * else with `enabled` false is a setup that is damaged or was left partway by a disable.
 */
export function previewSetupState(policy: PreviewPolicy): PreviewSetupState {
	if (policy.enabled) {
		return 'on';
	}
	const nothingThere = policy.grant === null && policy.trust.length === 0
		&& policy.problems.every((problem) => problem.endsWith(' is missing'));
	return nothingThere ? 'off' : 'incomplete';
}

export function previewPolicyQueryOptions(params: InstanceClientIdConfig & { app: string; enabled?: boolean }) {
	return queryOptions({
		queryKey: [params.entityId, 'get_preview_policy', params.app] as const,
		queryFn: async () => {
			const { data } = await params.instanceClient.post<PreviewPolicy>('/', {
				operation: 'get_preview_policy',
				app: params.app,
			});
			return data;
		},
		enabled: params.enabled,
	});
}

export interface EnablePreviewsRequest {
	app: string;
	repository: string;
	repository_id: string;
	branch: string;
	audience: string;
	hostSuffix?: string;
	dataMode: 'branched' | 'shared';
	maxPreviews?: number;
	maxTtlDays: number;
}

export interface EnablePreviewsResponse extends PreviewPolicy {
	message: string;
	created: string[];
}

/**
 * Each of these panels renders its failure beside what failed, so the global toast would repeat it. A 4xx is Harper's
 * answer to this request, such as enable's 409; anything else still has to reach RUM, which only `console.error` does.
 */
const panelMutationOptions = {
	meta: { skipGlobalErrorToast: true },
	onError: (error: unknown) => {
		const status = isAxiosError(error) ? error.response?.status : undefined;
		if (!status || status >= 500) {
			console.error(error);
		}
	},
};

export async function enablePreviews(
	{ instanceClient, request }: InstanceClientConfig & { request: EnablePreviewsRequest },
) {
	const { data } = await instanceClient.post<EnablePreviewsResponse>('/', { operation: 'enable_previews', ...request });
	return data;
}

export function useEnablePreviews() {
	return useMutation({ mutationFn: enablePreviews, ...panelMutationOptions });
}

export interface DroppedPreview {
	node: string;
	project: string;
	deploymentId: string;
	componentRemoved?: boolean;
	message?: string;
	error?: string;
}

export interface DisablePreviewsResponse {
	message: string;
	app: string;
	dropped: DroppedPreview[];
	removed: string[];
	/** Previews whose deploy had not finished; one can still go live, and is then bound by its expiry. */
	inProgress?: string[];
}

/** Rejects with a 500 once the identity is revoked and a drop failed, and running it again resumes. */
export async function disablePreviews({ instanceClient, app }: InstanceClientConfig & { app: string }) {
	const { data } = await instanceClient.post<DisablePreviewsResponse>(
		'/',
		{ operation: 'disable_previews', app },
		{ timeout: DISABLE_PREVIEWS_TIMEOUT_MS },
	);
	return data;
}

export function useDisablePreviews() {
	return useMutation({ mutationFn: disablePreviews, ...panelMutationOptions });
}

export async function dropPreview(
	{ instanceClient, project, replicated }: InstanceClientConfig & { project: string; replicated: boolean },
) {
	const { data } = await instanceClient.post<ReplicatedResponse>(
		'/',
		{ operation: 'drop_component', project, replicated },
		{ timeout: DROP_PREVIEW_TIMEOUT_MS, keepReplicationFailures: true },
	);
	return data;
}

export function useDropPreview() {
	return useMutation({ mutationFn: dropPreview, ...panelMutationOptions });
}

export interface LivePreview {
	project: string;
	host?: string;
	preview: PreviewMetadata;
}

export function livePreviewsOf(tree: APIDirectoryEntry | undefined, app: string): LivePreview[] {
	const previews = (tree?.entries ?? []).flatMap((entry) => {
		const { name, host, preview } = entry as APIDirectoryEntry;
		return preview?.app === app ? [{ project: name, host, preview }] : [];
	});
	return previews.sort((a, b) => b.preview.pr - a.preview.pr);
}

export function previewableApplications(tree: APIDirectoryEntry | undefined): string[] {
	const names = (tree?.entries ?? []).flatMap((entry) => isDirectory(entry) && !entry.preview ? [entry.name] : []);
	return names.sort((a, b) => a.localeCompare(b));
}

export function previewExpiresAtMs(preview: PreviewMetadata): number | undefined {
	const { expiresAt } = preview;
	const ms = typeof expiresAt === 'number' ? expiresAt : typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
	return Number.isFinite(ms) ? ms : undefined;
}
