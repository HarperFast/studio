export async function getGitHubRepo(url: URL) {
	if (url && url.pathname && url.hostname.includes('github.com')) {
		const parts = url.pathname.split('/').filter(Boolean);

		try {
			const response = await fetch(`https://api.github.com/repos/${parts[0]}/${parts[1]}`);
			const data = await response.json();

			return response.ok ? data.name : null;
		} catch {
			return null;
		}
	}
}
