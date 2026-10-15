export function draftClusterIdOf(savedClusterState: unknown): string | undefined {
	if (typeof savedClusterState !== 'object' || savedClusterState === null) {
		return undefined;
	}
	const { clusterId } = savedClusterState as { clusterId?: unknown };
	return typeof clusterId === 'string' && clusterId ? clusterId : undefined;
}
