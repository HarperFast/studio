import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';
import { describe, expect, it } from 'vitest';
import releaseConfig, { closingReferences } from './release.config.mjs';

type PluginEntry = [string, Record<string, unknown>];

function pluginConfig(name: string) {
	const entry = (releaseConfig.plugins as PluginEntry[]).find(([plugin]) => plugin === name);
	if (!entry) {
		throw new Error(`release.config.mjs no longer configures ${name}`);
	}
	return entry[1];
}

const silent = { log() {}, info() {}, warn() {}, error() {}, success() {} };

function context(messages: string[]) {
	return {
		cwd: __dirname,
		logger: silent,
		commits: messages.map((message, index) => ({ hash: `${index}`.padStart(40, 'a'), message })),
		lastRelease: { gitTag: 'v2.212.0', version: '2.212.0' },
		nextRelease: { gitTag: 'v2.213.0', version: '2.213.0' },
		options: { repositoryUrl: 'https://github.com/HarperFast/studio.git' },
	};
}

const squash = `feat(full-text): declare full-text indexes in the schema editor (#2080)

* feat(full-text): declare full-text indexes in the schema editor

Studio couldn't declare one or try a search (#2014). Unlike harper#3656, this needs no restart,
and against a central-manager without #785 the tester degrades.

Closes #2014

* fix(full-text): harden the index editor from review

Refs #2055
Closes HarperFast/studio#2014
Fixes HarperFast/harper#4079

---------

Co-authored-by: Claude Opus 5.5 <noreply@anthropic.com>
`;

describe('closingReferences', () => {
	const repo = { owner: 'HarperFast', repository: 'studio' };

	it('drops references no closing keyword introduced', () => {
		expect(closingReferences([{ action: null, issue: '2055' }, { action: 'Closes', issue: '2014' }], repo)).toEqual([
			{ action: 'Closes', issue: '2014' },
		]);
	});

	it('keeps one of each issue however it was spelled', () => {
		const references = [
			{ action: 'Closes', issue: '2014' },
			{ action: 'Fixes', repository: 'studio', issue: '2014' },
			{ action: 'closes', owner: 'harperfast', repository: 'Studio', issue: '2014' },
			{ action: 'Fixes', repository: 'harper', issue: '2014' },
		];

		expect(closingReferences(references, repo)).toEqual([references[0], references[3]]);
	});
});

describe('release notes for a squash merge', () => {
	it('lists the PR once, under its title type, with only the issues it closes', async () => {
		const notes: string = await generateNotes(
			pluginConfig('@semantic-release/release-notes-generator'),
			context([squash]),
		);
		const entries = notes.split('\n').filter((line) => line.startsWith('* '));

		expect(notes).toContain('### Features');
		expect(notes).not.toContain('### Bug Fixes');
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatch(/^\* \*\*full-text:\*\* declare full-text indexes in the schema editor \(\[#2080\]/);
		expect(entries[0]).toMatch(
			/, closes \[#2014\]\(https:\/\/github\.com\/HarperFast\/studio\/issues\/2014\) \[HarperFast\/harper#4079\]\(https:\/\/github\.com\/HarperFast\/harper\/issues\/4079\)$/,
		);
	});

	it('releases by the title type, not the commits under it', async () => {
		const title = (type: string) => squash.replace(/^feat/, type);
		const analyze = (message: string) =>
			analyzeCommits(pluginConfig('@semantic-release/commit-analyzer'), context([message]));

		expect(await analyze(squash)).toBe('minor');
		expect(await analyze(title('fix'))).toBe('patch');
	});
});
