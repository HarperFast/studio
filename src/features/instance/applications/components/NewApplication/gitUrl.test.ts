import { describe, expect, it } from 'vitest';
import { extractGitUrlHost, replaceGitUrlHost, toSSHGitUrl, usesNonSSHTransport } from './gitUrl';

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

describe('usesNonSSHTransport', () => {
	it('flags the transports that never authenticate with an SSH key', () => {
		expect(usesNonSSHTransport('https://github.com/acme/widgets.git')).toBe(true);
		expect(usesNonSSHTransport('  http://git.example.com/team/app.git  ')).toBe(true);
		expect(usesNonSSHTransport('git+https://github.com/acme/widgets.git')).toBe(true);
		expect(usesNonSSHTransport('git+http://github.com/acme/widgets.git')).toBe(true);
		expect(usesNonSSHTransport('git://github.com/acme/widgets.git')).toBe(true);
		expect(usesNonSSHTransport('HTTPS://dev.azure.com/acme/widgets/_git/widgets')).toBe(true);
	});

	it('does not flag SSH URLs or references without a transport', () => {
		expect(usesNonSSHTransport('git@github.com:acme/widgets.git')).toBe(false);
		expect(usesNonSSHTransport('github.com:acme/widgets.git')).toBe(false);
		expect(usesNonSSHTransport('ssh://git@github.com/acme/widgets.git')).toBe(false);
		expect(usesNonSSHTransport('git+ssh://git@github.com/acme/widgets.git')).toBe(false);
		expect(usesNonSSHTransport('file:///srv/widgets.git')).toBe(false);
		expect(usesNonSSHTransport('github:acme/widgets')).toBe(false);
		expect(usesNonSSHTransport('@harperdb/some-package')).toBe(false);
		expect(usesNonSSHTransport('')).toBe(false);
	});
});

describe('toSSHGitUrl', () => {
	it("rewrites an https URL as the scp-like SSH URL on the key's host alias", () => {
		expect(toSSHGitUrl('https://github.com/acme/widgets.git', 'work.github.com'))
			.toBe('git@work.github.com:acme/widgets.git');
		expect(toSSHGitUrl('  https://gitlab.com/group/sub/widgets  ', 'work.gitlab.com'))
			.toBe('git@work.gitlab.com:group/sub/widgets');
		expect(toSSHGitUrl('https://bitbucket.org/acme/widgets.git', 'work.bitbucket.org'))
			.toBe('git@work.bitbucket.org:acme/widgets.git');
	});

	it('rewrites the other non-SSH transports, whatever the case of the host', () => {
		expect(toSSHGitUrl('git+https://GitHub.com/acme/widgets.git', 'w.github.com'))
			.toBe('git@w.github.com:acme/widgets.git');
		expect(toSSHGitUrl('git://github.com/acme/widgets.git', 'w.github.com')).toBe('git@w.github.com:acme/widgets.git');
		expect(toSSHGitUrl('HTTP://GITHUB.COM/Acme/Widgets.git', 'w.github.com')).toBe('git@w.github.com:Acme/Widgets.git');
	});

	it('keeps a committish and drops a query string, a port and a trailing slash', () => {
		expect(toSSHGitUrl('https://github.com/acme/widgets.git#v1.2.3', 'w.github.com'))
			.toBe('git@w.github.com:acme/widgets.git#v1.2.3');
		expect(toSSHGitUrl('https://github.com/acme/widgets.git#semver:^1.0.0', 'w.github.com'))
			.toBe('git@w.github.com:acme/widgets.git#semver:^1.0.0');
		expect(toSSHGitUrl('https://github.com/acme/widgets?tab=readme-ov-file', 'w.github.com'))
			.toBe('git@w.github.com:acme/widgets');
		expect(toSSHGitUrl('https://github.com:443/acme/widgets/', 'w.github.com')).toBe('git@w.github.com:acme/widgets');
	});

	it('never carries userinfo, which may hold a token, into the suggestion', () => {
		expect(toSSHGitUrl('https://someone:ghp_secret@github.com/acme/widgets.git', 'w.github.com'))
			.toBe('git@w.github.com:acme/widgets.git');
	});

	it('returns null for a host whose SSH path may not mirror its HTTPS path', () => {
		expect(toSSHGitUrl('https://dev.azure.com/acme/widgets/_git/widgets', 'w.azure.com')).toBeNull();
		expect(toSSHGitUrl('https://git.example.com/team/app.git', 'app.git.example.com')).toBeNull();
		expect(toSSHGitUrl('https://www.github.com/acme/widgets.git', 'w.github.com')).toBeNull();
	});

	it('returns null for URLs that already use SSH and references it cannot rewrite', () => {
		expect(toSSHGitUrl('git@github.com:acme/widgets.git', 'w.github.com')).toBeNull();
		expect(toSSHGitUrl('ssh://git@github.com/acme/widgets.git', 'w.github.com')).toBeNull();
		expect(toSSHGitUrl('git+ssh://git@github.com/acme/widgets.git', 'w.github.com')).toBeNull();
		expect(toSSHGitUrl('https://github.com', 'w.github.com')).toBeNull();
		expect(toSSHGitUrl('https://github.com/', 'w.github.com')).toBeNull();
		expect(toSSHGitUrl('', 'w.github.com')).toBeNull();
	});
});
