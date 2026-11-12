/**
 * @typedef {{ action?: string | null, owner?: string | null, repository?: string | null, issue: string }} Reference
 * @typedef {{ owner?: string, repository?: string, commitGroups?: { commits: { references?: Reference[] }[] }[] }} NotesContext
 */

/**
 * Keeps only the issues a commit closes, each once.
 *
 * The parser collects every `#123` in a message, and the `conventionalcommits` template lists them
 * all after ", closes". A squash merge's message holds every commit of the PR, so without this its
 * note claims to close each issue those commits mention, often more than once. Only a reference
 * the parser tied to a closing keyword (`Closes`, `Fixes`, `Resolves`, …) has an `action`.
 *
 * @param {Reference[]} references
 * @param {{ owner?: string, repository?: string }} repo the repository the release is for
 * @returns {Reference[]}
 */
export function closingReferences(references, { owner, repository }) {
	const seen = new Set();
	return references.filter((reference) => {
		if (!reference.action) {
			return false;
		}
		const key = `${reference.owner ?? owner}/${reference.repository ?? repository}#${reference.issue}`.toLowerCase();
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

/**
 * conventional-changelog-writer hook: runs after the preset's own per-commit transform, which has
 * already dropped references repeated in the subject (the squash's `(#123)`).
 *
 * @param {NotesContext} context
 * @returns {NotesContext}
 */
function closingReferencesOnly(context) {
	return {
		...context,
		commitGroups: context.commitGroups?.map((group) => ({
			...group,
			commits: group.commits.map((commit) => ({
				...commit,
				references: closingReferences(commit.references ?? [], context),
			})),
		})),
	};
}

export default {
	branches: ['stage'],
	tagFormat: 'v${version}',
	plugins: [
		[
			'@semantic-release/commit-analyzer',
			{
				preset: 'conventionalcommits',
				releaseRules: [
					{ type: 'feat', release: 'minor' },
					{ type: 'fix', release: 'patch' },
					{ type: 'perf', release: 'patch' },
					{ type: 'refactor', release: 'patch' },
					{ type: 'chore', release: 'patch' },
					{ type: 'docs', release: 'patch' },
					{ type: 'style', release: 'patch' },
					{ type: 'test', release: 'patch' },
					{ type: 'build', release: 'patch' },
					{ type: 'ci', release: 'patch' },
					{ type: 'revert', release: 'patch' },
					{ type: '*', release: 'patch' },
				],
			},
		],
		[
			'@semantic-release/release-notes-generator',
			{
				preset: 'conventionalcommits',
				presetConfig: {
					types: [
						{ type: 'feat', section: 'Features' },
						{ type: 'fix', section: 'Bug Fixes' },
						{ type: 'perf', section: 'Performance Improvements' },
						{ type: 'refactor', section: 'Refactoring' },
						{ type: 'chore', scope: 'deps', section: 'Dependency Updates', hidden: false },
						{ type: 'chore', section: 'Chores', hidden: false },
						{ type: 'docs', section: 'Documentation' },
						{ type: 'style', section: 'Styles' },
						{ type: 'test', section: 'Tests' },
						{ type: 'build', section: 'Build System' },
						{ type: 'ci', section: 'Continuous Integration' },
						{ type: 'revert', section: 'Reverts' },
					],
				},
				writerOpts: {
					finalizeContext: closingReferencesOnly,
				},
			},
		],
		[
			'@semantic-release/github',
			{
				successCommentCondition: false,
			},
		],
	],
};
