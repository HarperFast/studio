import clusterGetRoutes from '../../api/instance/clusterGetRoutes';

const processNatsConnections = async ({ auth, url, instances, connections }) => {
	const natsConnections = await clusterGetRoutes({ auth, url });

	return natsConnections.hub
		.map((c) => {
			const connectedInstance = instances.find((i) => i.host === c.host || i.private_ip === c.host);
			if (!connectedInstance) {
				return false;
			}
			const connectedInstanceHost =
				connectedInstance.host === connectedInstance.private_ip ? connectedInstance.private_ip : connectedInstance.host;
			const connectedInstanceSubscriptions = connections.find(
				(i) => i.node_name === connectedInstance?.clustering?.node_name
			);
			const hydratedSubscriptions =
				connectedInstanceSubscriptions?.subscriptions?.map((s) => ({ channel: `${s.schema}:${s.table}`, ...s })) || [];
			return {
				host: connectedInstanceHost,
				port: c.port,
				state: 'open',
				name: connectedInstance?.compute_stack_id,
				subscriptions: hydratedSubscriptions,
			};
		})
		.filter((c) => c !== false);
};

export default processNatsConnections;
