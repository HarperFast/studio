import { describe, expect, it } from 'vitest';
import { extractGitUrlHost, replaceGitUrlHost } from './gitUrl';

describe('extractGitUrlHost', () => {
	it('parses scp-like git URLs', () => {
		expect(extractGitUrlHost('git@github.com:HarperFast/studio.git')).toBe('github.com');
		expect(extractGitUrlHost('git@your-repo.github.com:HarperFast/studio.git')).toBe('your-repo.github.com');
	});

	it('parses scp-like URLs without a user', () => {
		expect(extractGitUrlHost('github.com:HarperFast/studio.git')).toBe('github.com');
	});

	it('parses ssh:// URLs, ignoring user and port', () => {
		expect(extractGitUrlHost('ssh://git@github.com/HarperFast/studio.git')).toBe('github.com');
		expect(extractGitUrlHost('ssh://git@github.com:22/HarperFast/studio.git')).toBe('github.com');
	});

	it('parses https:// URLs, ignoring port', () => {
		expect(extractGitUrlHost('https://github.com/HarperFast/studio.git')).toBe('github.com');
		expect(extractGitUrlHost('https://github.com:443/HarperFast/studio.git')).toBe('github.com');
	});

	it('trims surrounding whitespace', () => {
		expect(extractGitUrlHost('  git@github.com:HarperFast/studio.git  ')).toBe('github.com');
	});

	it('returns null for references without a detectable host', () => {
		expect(extractGitUrlHost('')).toBeNull();
		expect(extractGitUrlHost('   ')).toBeNull();
		expect(extractGitUrlHost('@harperdb/some-package')).toBeNull();
		expect(extractGitUrlHost('some-package')).toBeNull();
		expect(extractGitUrlHost('package@1.2.3')).toBeNull();
	});
});

describe('replaceGitUrlHost', () => {
	it('swaps the host in scp-like URLs, preserving user and path', () => {
		expect(replaceGitUrlHost('git@github.com:HarperFast/studio.git', 'your-repo.github.com'))
			.toBe('git@your-repo.github.com:HarperFast/studio.git');
	});

	it('swaps the host in scp-like URLs without a user', () => {
		expect(replaceGitUrlHost('github.com:HarperFast/studio.git', 'your-repo.github.com'))
			.toBe('your-repo.github.com:HarperFast/studio.git');
	});

	it('swaps the host in ssh:// URLs, preserving port and path', () => {
		expect(replaceGitUrlHost('ssh://git@github.com:22/HarperFast/studio.git', 'your-repo.github.com'))
			.toBe('ssh://git@your-repo.github.com:22/HarperFast/studio.git');
	});

	it('swaps the host in https:// URLs', () => {
		expect(replaceGitUrlHost('https://github.com/HarperFast/studio.git', 'your-repo.github.com'))
			.toBe('https://your-repo.github.com/HarperFast/studio.git');
	});

	it('only replaces the host, not matching path segments', () => {
		expect(replaceGitUrlHost('https://github.com/github.com/repo.git', 'alias.github.com'))
			.toBe('https://alias.github.com/github.com/repo.git');
	});

	it('returns the reference unchanged when no host is detectable', () => {
		expect(replaceGitUrlHost('some-package', 'github.com')).toBe('some-package');
	});

	it('treats $ sequences in the new host literally (no replacement-pattern injection)', () => {
		expect(replaceGitUrlHost('git@github.com:org/repo.git', 'weird$&host.com'))
			.toBe('git@weird$&host.com:org/repo.git');
	});
});
