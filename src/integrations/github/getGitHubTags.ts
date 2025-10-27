export async function getGitHubTags(user: string, repo: string) {
	const response = await fetch(`https://api.github.com/repos/${user}/${repo}/git/refs/tags`);

	if (response.status < 400) {
		const tagData = await response.json();
		return tagData.map((tag: { ref: string }) => tag.ref.split('/').slice(-1)[0]);
	}

	return [];
}
