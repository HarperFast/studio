import queryInstance from '../queryInstance';

export default async ({ compute_stack_id, auth, url }) =>
	queryInstance({
		operation: {
			operation: 'remove_node',
			name: compute_stack_id,
			node_name: compute_stack_id,
		},
		auth,
		url,
	});
