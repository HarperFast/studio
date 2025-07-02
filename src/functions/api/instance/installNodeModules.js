import queryInstance from '../queryInstance';

export default async ({ auth, url, projects, dry_run = false }) =>
	queryInstance({
		operation: { operation: 'install_node_modules', projects, dry_run },
		auth,
		url,
	});
