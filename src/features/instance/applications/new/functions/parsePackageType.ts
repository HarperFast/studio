type PackageMetaType = {
	type: string | null;
	user: string | null;
	repo: string | null;
	url: string | null;
	package: string | null;
	tag: string | null;
};

function parsePackageType(pkg: { url: string }) {
	if (!pkg) {
		return null;
	}

	const meta: PackageMetaType = {
		type: null,
		user: null,
		repo: null,
		url: null,
		package: null,
		tag: null,
	};

	if (pkg.url.includes('://')) {
		// it's a url
		meta.url = pkg.url;
		meta.type = 'url';
	} else if (pkg.url.match('semver:')) {
		// it's a GitHub repo
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

export default parsePackageType;
