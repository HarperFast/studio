import { findNodeAtLocation, parseTree } from 'jsonc-parser';

export interface JsonPathRange {
	path: string;
	/** Where the property starts: its key. */
	offset: number;
	/** Through the end of its value. */
	length: number;
}

/**
 * Where each dotted `path` sits in `text`, for the ones present. A half-typed document still parses as far as it goes,
 * so the markers keep up while the JSON is invalid.
 */
export function locateJsonPaths(text: string, paths: readonly string[]): JsonPathRange[] {
	const root = parseTree(text);
	if (!root) {
		return [];
	}
	return paths.flatMap(path => {
		const property = findNodeAtLocation(root, path.split('.'))?.parent;
		return property?.type === 'property' ? [{ path, offset: property.offset, length: property.length }] : [];
	});
}
