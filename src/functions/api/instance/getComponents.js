import queryInstance from '../queryInstance';

// this 'addMetadata' logic probably belongs in src/functions/instance
// by convention
function addMetadata(fileTree, path, rootDir, readOnly = false) {
	if (!fileTree || !fileTree.entries) {
		return;
	}

	if (path === rootDir) {
		fileTree.path = rootDir;
		fileTree.key = crypto.randomUUID?.() ?? Math.random().toString().slice(2);
	}

	for (const entry of fileTree.entries) {
		/*
		 * adds 3 properties to directory entry:
		 *   - project, which is the dir under component root on the instance
		 *   - path, which is the file path relative to the project
		 *   - unique key for react dynamic list optimization
		 */

		const newPath = `${path}/${entry.name}`;
		const [, project] = newPath.split('/');
		entry.project = project;
		entry.path = newPath;
		entry.key = crypto.randomUUID?.() ?? Math.random().toString().slice(2);
		entry.readOnly = readOnly || !!entry.package;

		addMetadata(entry, newPath, rootDir, entry.readOnly);
	}
}

export default async ({ auth, url }) => {
	const fileTree = await queryInstance({
		operation: { operation: 'get_components' },
		auth,
		url,
	});

	addMetadata(fileTree, fileTree.name, fileTree.name, false);

	return fileTree;
};
