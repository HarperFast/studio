export async function getNpmDistTags(packageName: string) {
	// searching for a non-existent package via https://registry.npmjs.org/<packageName> will throw a cors error
	// so instead, we search for repo using api /search endpoint, compare desired package name
	// against the returned results array. If one exactly matches, that package exists.
	// When the package exists, we can then look it up against the registry by its package name (avoiding cors error)
	// and grab the resulting 'dist-tags' property from the returned payload.

	const packageResponse = await fetch(`https://registry.npmjs.org/${packageName}`);
	const packageResponseData = await packageResponse.json();

	return packageResponseData['dist-tags'];
}
