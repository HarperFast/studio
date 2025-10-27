export async function findNpmPackageName(query: string) {
	const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=${query}`);
	const packages = await response.json();
	const pkg = packages.objects.find((p: { package: { name: string } }) => p.package.name === query);

	return pkg?.package?.name;
}
