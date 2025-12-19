import { describe, expect, it } from 'vitest';

import { transformNodes } from './transformNodes';

type Node = { id: string; children?: Node[] };

describe('transformNodes', () => {
	it('transforms nested nodes while passing parent chain', () => {
		const nodes: Node[] = [
			{
				id: 'root',
				children: [
					{ id: 'child-1' },
					{
						id: 'child-2',
						children: [{ id: 'grandchild-1' }],
					},
				],
			},
		];

		const transformed = transformNodes(
			nodes,
			'children',
			(node, parents) => ({
				id: node.id,
				depth: parents.length,
				parentIds: parents.map(parent => parent.id),
			}),
		);

		expect(transformed).toEqual([
			{
				id: 'root',
				depth: 0,
				parentIds: [],
				children: [
					{ id: 'child-1', depth: 1, parentIds: ['root'] },
					{
						id: 'child-2',
						depth: 1,
						parentIds: ['root'],
						children: [
							{ id: 'grandchild-1', depth: 2, parentIds: ['root', 'child-2'] },
						],
					},
				],
			},
		]);
	});

	it('handles nodes without nested collections', () => {
		const flatNodes: Node[] = [{ id: 'a' }, { id: 'b' }];

		const transformed = transformNodes(
			flatNodes,
			'children',
			(node, parents) => ({
				value: node.id,
				hasParents: parents.length > 0,
			}),
		);

		expect(transformed).toEqual([
			{ value: 'a', hasParents: false },
			{ value: 'b', hasParents: false },
		]);
	});
});
