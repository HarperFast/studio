export default ({ instances, network, instance_region, instance_wavelength_zone_id, instance_cluster_engine }) => {
	const activeInstances = instances.filter((i) => i.url && i.status !== 'DELETE_IN_PROGRESS');
	const compatibleInstances = activeInstances.filter((i) => i.clustering.engine === instance_cluster_engine);

	const processedInstances = compatibleInstances.map((i) => {
		const connection =
			instance_cluster_engine === 'socketcluster'
				? network?.connections.find((n) => n.name === i.compute_stack_id)
				: network?.connections.find((n) => n.host === i.host);
		const subscriptions = connection?.subscriptions || [];
		const clusterPort = i?.clustering?.config_cluster_port;
		const instance_status = i.is_local ? 'OK' : i.status;
		const instance_host =
			instance_region && instance_region === i.instance_region && !i.wavelength_zone_id && !instance_wavelength_zone_id
				? i.private_ip
				: i.url.match(/^https?:\/\/([^/:?#]+)(?:[/:?#]|$)/i)[1];
		const clusterName = i.clustering.node_name;

		return {
			instance_name: i.instance_name,
			instance_url: i.url,
			compute_stack_id: i.compute_stack_id,
			instance_status,
			instance_host,
			clusterPort,
			clusterName,
			connection,
			subscriptions,
			structure: i.structure,
			configured: i.clustering?.is_ready,
		};
	});

	const unreachable = instances
		.filter((i) => i.clustering.engine !== instance_cluster_engine)
		.map((i) => ({
			instance_name: i.instance_name,
			compute_stack_id: i.name,
		}));

	const connected = processedInstances.filter((i) => i.connection && i.configured);
	const unconnected = processedInstances.filter((i) => !i.connection && i.configured);
	const unconfigured = processedInstances.filter((i) => !i.configured);

	return {
		connected,
		unconnected,
		unconfigured,
		unreachable,
	};
};
