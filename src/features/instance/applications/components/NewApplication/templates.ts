import { templates as catalog } from 'create-harper/templates';

// create-harper is the single source of truth for the template list, descriptions, npm packages, and
// GitHub links. New templates added there flow through here (and into the createApp agent tool)
// automatically. create-harper lists TypeScript-first; we re-sort to Studio's established display order
// (by framework, then non-SSR before SSR, then JavaScript before TypeScript) so the picker and its
// default selection stay stable.
const FRAMEWORK_ORDER = ['vanilla', 'react', 'vue'] as const;

// Rank a framework by its position in FRAMEWORK_ORDER. Any framework not listed (e.g. a future
// Svelte/Angular template added to create-harper) sorts to the end rather than the top.
function frameworkRank(framework: string): number {
	const index = (FRAMEWORK_ORDER as readonly string[]).indexOf(framework);
	return index === -1 ? Infinity : index;
}

export const templates = [...catalog]
	.sort((a, b) =>
		frameworkRank(a.framework) - frameworkRank(b.framework)
		|| Number(a.ssr) - Number(b.ssr)
		|| Number(a.typescript) - Number(b.typescript)
	)
	.map((t) => ({
		// Widen to `string`: the New Application form supplies the selected id as a plain string.
		id: t.name as string,
		name: t.title,
		description: t.description,
		tags: [...t.tags],
		npm: t.npmPackage,
		githubUrl: t.githubUrl,
	}));
