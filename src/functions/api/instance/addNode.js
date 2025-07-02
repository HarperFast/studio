import queryInstance from '../queryInstance';

export default async ({ compute_stack_id, instance_host, clusterPort, auth, url }) =>
	queryInstance({
		operation: {
			operation: 'add_node',
			name: compute_stack_id,
			node_name: compute_stack_id,
			host: instance_host,
			port: clusterPort,
			subscriptions: [],
		},
		auth,
		url,
	});
