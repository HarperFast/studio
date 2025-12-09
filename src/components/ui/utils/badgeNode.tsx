const nodeVariant = ['secondary', 'default', 'warning', 'outline', 'success', 'destructive'] as const;

let nodeEntries = 0;
const cache = new Map<string, BadgeNodeVariantValues>();

const memoizeNodeNames = (nodeName: string): BadgeNodeVariantValues => {
	if (cache.has(nodeName)) { return cache.get(nodeName)!; }
	nodeEntries++;
	const nodeVariantIndex = nodeEntries % nodeVariant.length;
	const memoized = nodeVariant[nodeVariantIndex] as BadgeNodeVariantValues;
	cache.set(nodeName, memoized);
	return memoized;
};

export type BadgeNodeVariantValues = (typeof nodeVariant)[number];

export { memoizeNodeNames, nodeVariant };
