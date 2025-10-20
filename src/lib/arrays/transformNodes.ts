export function transformNodes<Transformed, Branch, Leaf>(
	nodes: Array<Branch | Leaf>,
	nestedPropertyName: keyof Branch,
	transformer: (node: Branch | Leaf, parents: Branch[]) => Transformed,
	parents: Branch[] = [],
): Transformed[] {
	const results: Transformed[] = [];

	for (const node of nodes) {
		const transformed = transformer(node, parents);
		results.push(transformed);
		const potentialBranch = node as Branch;
		const nestedNodes = potentialBranch[nestedPropertyName] as Array<Branch | Leaf>;
		if (nestedNodes) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(transformed as any)[nestedPropertyName] = transformNodes(nestedNodes, nestedPropertyName, transformer, [...parents, potentialBranch]);
		}
	}

	return results;
}
