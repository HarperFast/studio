/**
 * Resolves a GitHub repository to the numeric id an OIDC trust policy pins as `repository_id`. A name can be taken over
 * after a rename or a delete; the id cannot. Every panel that sets up GitHub Actions on a cluster shares this lookup:
 * the Previews panel today, and Deploy from GitHub (studio#1788) once it is built.
 *
 * The request is anonymous and comes from the browser, so a private repository answers 404 exactly as a mistyped name
 * does, and the caller has to ask for the id instead. GitHub allows 60 of these an hour per address, hence the
 * debounce in `useGitHubRepositoryLookup` and a `rate-limited` answer distinct from `not-found`.
 */
import { useDebounce } from '@/hooks/useDebounce';
import { queryOptions, useQuery } from '@tanstack/react-query';

const LOOKUP_DEBOUNCE_MS = 400;
const LOOKUP_TIMEOUT_MS = 10_000;
const FOUND_STALE_MS = 5 * 60_000;
const MISS_STALE_MS = 60_000;

/** GitHub's own names, which an id lookup must not widen: a segment is never `.` or `..`, or a path. */
const REPOSITORY_SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9_.-]+$/;
const GITHUB_URL_PREFIX =
	/^(?:(?:https?|ssh|git\+https|git\+ssh):\/\/(?:[^@/]+@)?(?:www\.)?github\.com\/|git@github\.com:)/i;

export interface GitHubRepository {
	/** A string, as `repository_id` claims compare byte for byte. */
	id: string;
	/** GitHub's own spelling, which a `workflow_ref` claim has to match: the typed name may differ in case. */
	fullName: string;
	private: boolean;
	defaultBranch?: string;
}

export type GitHubRepositoryLookup =
	| { status: 'found'; repository: GitHubRepository }
	| { status: 'not-found' | 'rate-limited' | 'unavailable' };

/** `owner/name` from what a person pastes: that form, or a github.com URL or remote. Undefined for anything else. */
export function parseGitHubRepository(input: string): string | undefined {
	const trimmed = input.trim();
	const path = trimmed.replace(GITHUB_URL_PREFIX, '');
	const segments = path.replace(/\/+$/, '').split('/');
	const isUrl = path !== trimmed;
	if (segments.length < 2 || (!isUrl && segments.length > 2)) {
		return undefined;
	}
	const owner = segments[0];
	const name = segments[1].replace(/\.git$/i, '');
	return REPOSITORY_SEGMENT.test(owner) && REPOSITORY_SEGMENT.test(name) ? `${owner}/${name}` : undefined;
}

/**
 * What to run for a repository the lookup can't see. It prints both halves of the identity on one line, so GitHub's
 * spelling comes from GitHub and not from what someone typed.
 */
export function gitHubRepositoryCommand(fullName: string): string {
	return `gh api repos/${fullName} --jq '"\\(.id) \\(.full_name)"'`;
}

/** The id and name from the line `gitHubRepositoryCommand` prints, such as `123456 Acme/Shop`. */
export function parseGitHubRepositoryIdentity(input: string): Pick<GitHubRepository, 'id' | 'fullName'> | undefined {
	const match = /^([1-9]\d{0,19})\s+(\S+)$/.exec(input.trim());
	const fullName = match ? parseGitHubRepository(match[2]) : undefined;
	return match && fullName ? { id: match[1], fullName } : undefined;
}

function parseRepository(body: unknown): GitHubRepository | undefined {
	const data = body as { id?: unknown; full_name?: unknown; private?: unknown; default_branch?: unknown } | null;
	if (!Number.isSafeInteger(data?.id) || (data?.id as number) <= 0 || typeof data?.full_name !== 'string') {
		return undefined;
	}
	return {
		id: String(data.id),
		fullName: data.full_name,
		private: data.private === true,
		defaultBranch: typeof data.default_branch === 'string' ? data.default_branch : undefined,
	};
}

/** Never rejects: not finding a repository is an answer the form has to act on, not a failure to toast. */
export async function lookUpGitHubRepository(fullName: string): Promise<GitHubRepositoryLookup> {
	const [owner, name] = fullName.split('/').map(encodeURIComponent);
	try {
		const response = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
			headers: { Accept: 'application/vnd.github+json' },
			signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
		});
		if (response.status === 404) {
			return { status: 'not-found' };
		}
		if (response.status === 403 || response.status === 429) {
			return { status: 'rate-limited' };
		}
		const repository = response.ok ? parseRepository(await response.json()) : undefined;
		return repository ? { status: 'found', repository } : { status: 'unavailable' };
	} catch {
		return { status: 'unavailable' };
	}
}

export function gitHubRepositoryQueryOptions(fullName: string | undefined) {
	return queryOptions({
		queryKey: ['github_repository', fullName?.toLowerCase()] as const,
		queryFn: () => lookUpGitHubRepository(fullName as string),
		enabled: !!fullName,
		retry: false,
		staleTime: (query) => query.state.data?.status === 'found' ? FOUND_STALE_MS : MISS_STALE_MS,
		// The quota is shared by everything at this address, so returning to the tab must not spend it.
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
}

/**
 * The repository `input` names, and GitHub's answer for it. `lookup` is undefined until there is an answer for the
 * current input, so a caller can tell "still looking" from "not found".
 */
export function useGitHubRepositoryLookup(input: string): { fullName?: string; lookup?: GitHubRepositoryLookup } {
	const fullName = parseGitHubRepository(input);
	const settled = useDebounce(fullName, LOOKUP_DEBOUNCE_MS);
	const { data } = useQuery(gitHubRepositoryQueryOptions(settled));
	// Without regard to case, as the query key is: changing a name's case changes nothing GitHub would answer.
	return { fullName, lookup: fullName && settled?.toLowerCase() === fullName.toLowerCase() ? data : undefined };
}
