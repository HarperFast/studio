const processSocketClusterConnections = ({ connections }) =>
	connections
		? connections
				.filter((c) => c.host_address.indexOf('::ffff') === -1)
				.map((c) => ({
					name: c.node_name,
					host: c.host_address,
					port: c.host_port,
					state: c.state,
					subscriptions: c.subscriptions,
				}))
		: [];

export default processSocketClusterConnections;
