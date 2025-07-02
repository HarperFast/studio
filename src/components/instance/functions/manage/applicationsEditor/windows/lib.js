export function isValidProjectName(name) {
	return /^[a-zA-Z0-9-_]+$/.test(name);
}

export async function ensureRepoExists(user, repo) {
	try {
		const response = await fetch(`https://api.github.com/repos/${user}/${repo}`);
		const data = await response.json();

		return response.status < 400 ? data.name : null;
		// eslint-disable-next-line
	} catch (e) {
		return null;
	}
}

export async function getGithubTags(user, repo) {
	const response = await fetch(`https://api.github.com/repos/${user}/${repo}/git/refs/tags`);

	if (response.status < 400) {
		const tagData = await response.json();
		return tagData.map((tag) => tag.ref.split('/').slice(-1)[0]);
	}

	return [];
}

export async function findNpmPackageName(query) {
	const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=${query}`);
	const packages = await response.json();
	const pkg = packages.objects.find((p) => p.package.name === query);

	return pkg?.package?.name;
}

export async function getNpmDistTags(packageName) {
	// searching for a non-existent package via https://registry.npmjs.org/<packageName> will throw a cors error
	// so instead, we search for repo using api /search endpoint, compare desired package name
	// against the returned results array. If one exactly matches, that package exists.
	// When the package exists, we can then look it up against the registry by its package name (avoiding cors error)
	// and grab the resulting 'dist-tags' property from the returned payload.

	const packageResponse = await fetch(`https://registry.npmjs.org/${packageName}`);
	const packageResponseData = await packageResponse.json();

	return packageResponseData['dist-tags'];
}

export function parsePackageType(pkg) {
	if (!pkg) {
		return null;
	}

	const meta = {
		type: null,
		user: null,
		repo: null,
		url: null,
		package: null,
		tag: null,
	};

	if (pkg.url.match('://')) {
		// it's a url
		meta.url = pkg.url;
		meta.type = 'url';
	} else if (pkg.url.match('semver:')) {
		// it's a github repo
		const [user, repo, semverTag] = pkg.url.split(/[/#]/);
		meta.type = 'github';
		meta.user = user;
		meta.repo = repo;
		meta.tag = semverTag.replace('semver:', '');
	} else {
		meta.type = 'npm';
		const parts = pkg.url.split('/');

		// TODO: what should this format be?
		// what does the form need?

		if (parts.length === 1) {
			// no scope, e.g harperdb[@2], not @harperdb/harperdb[@2]

			const [p, tag] = parts[0].split('@');

			meta.package = p;
			meta.tag = tag;
		} else if (parts.length === 2) {
			// has @scope, e.g @harperdb/harperdb[@2]

			const [, pkgAndTag] = parts;
			const [p, tag] = pkgAndTag.split('@');

			meta.package = p;
			meta.tag = tag;
		}
	}

	return meta;
}
