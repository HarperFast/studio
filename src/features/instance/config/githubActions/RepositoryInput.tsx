import { FormDescription } from '@/components/ui/form/FormDescription';
import {
	GitHubRepository,
	gitHubRepositoryCommand,
	GitHubRepositoryLookup,
	parseGitHubRepositoryIdentity,
} from '@/integrations/github/lookUpGitHubRepository';

/** What the lookup found for the repository field, or why the id has to be pasted instead. */
export function RepositoryLookupMessage(
	{ fullName, lookup }: { fullName: string | undefined; lookup: GitHubRepositoryLookup | undefined },
) {
	if (!fullName) {
		return <FormDescription>The owner and name, such as acme/shop, or the repository's URL.</FormDescription>;
	}
	if (!lookup) {
		return <FormDescription>Looking {fullName} up on GitHub…</FormDescription>;
	}
	if (lookup.status === 'found') {
		return <FormDescription>{lookup.repository.fullName}, id {lookup.repository.id}.</FormDescription>;
	}
	return (
		<FormDescription>
			{lookup.status === 'not-found'
				? `GitHub doesn't show ${fullName} publicly. If it's private, paste its id and name below. Otherwise, check the name.`
				: lookup.status === 'rate-limited'
				? "GitHub's limit on lookups from this address was reached, so paste the id and name below."
				: "GitHub couldn't be reached, so paste the id and name below."}
		</FormDescription>
	);
}

export function RepositoryIdentityHint({ fullName }: { fullName: string | undefined }) {
	return (
		<FormDescription>
			<code className="font-mono">{fullName && gitHubRepositoryCommand(fullName)}</code>{' '}
			prints the line to paste. GitHub Actions has to match its spelling exactly.
		</FormDescription>
	);
}

export type RepositoryIdentityResult =
	| { identity: Pick<GitHubRepository, 'id' | 'fullName'> }
	| { field: 'repository' | 'repositoryIdentity'; message: string };

/**
 * The id and GitHub's spelling of the repository someone named: from the lookup, or from the `gh api` line they pasted
 * when GitHub couldn't show it. A pasted line has to be for the repository in the other field.
 */
export function resolveRepositoryIdentity(
	{ fullName, lookup, pasted }: {
		fullName: string | undefined;
		lookup: GitHubRepositoryLookup | undefined;
		pasted: string;
	},
): RepositoryIdentityResult {
	if (!fullName) {
		return { field: 'repository', message: 'Enter the repository as owner/name.' };
	}
	if (!lookup) {
		return { field: 'repository', message: `Still looking ${fullName} up. Try again in a moment.` };
	}
	if (lookup.status === 'found') {
		const { id, fullName: spelled } = lookup.repository;
		// GitHub follows a rename, so the answer can be for another name, which is the one runs carry.
		return spelled.toLowerCase() === fullName.toLowerCase()
			? { identity: { id, fullName: spelled } }
			: { field: 'repository', message: `GitHub knows ${fullName} as ${spelled} now. Enter that name.` };
	}
	const identity = parseGitHubRepositoryIdentity(pasted);
	if (!identity) {
		return { field: 'repositoryIdentity', message: 'Paste the line the command prints: the id, then the name.' };
	}
	if (identity.fullName.toLowerCase() !== fullName.toLowerCase()) {
		return { field: 'repositoryIdentity', message: `That line is for ${identity.fullName}, not ${fullName}.` };
	}
	return { identity };
}
