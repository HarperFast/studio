import instanceState from '../../state/instanceState';
import instanceManagerGroups from './instanceManagerGroups';
import datatableFormat from './datatableFormat';
import datatableRows from './datatableRows';
import processInstance from './processInstance';
import processNatsConnections from './processNatsConnections';
import processSocketClusterConnections from './processSocketClusterConnections';

const buildNetwork = async ({ auth, url, instances, compute_stack_id, instanceAuths, setLoading }) => {
	const hydratedInstances = await Promise.all(
		instances
			.filter((i) => !!instanceAuths[i.compute_stack_id])
			.map((instance) => processInstance({ instance, auth: instanceAuths[instance.compute_stack_id] }))
	);
	const thisInstance = hydratedInstances.find((i) => i.compute_stack_id === compute_stack_id);

	const processedConnections =
		thisInstance.clustering.message || !thisInstance.clustering.is_enabled
			? []
			: thisInstance.clustering.engine === 'nats'
				? await processNatsConnections({
						auth,
						url,
						instances: hydratedInstances,
						connections: thisInstance.clustering.connections,
					})
				: processSocketClusterConnections({ connections: thisInstance.clustering.status.outbound_connections });

	const network = {
		is_enabled: thisInstance.clustering.is_enabled,
		connections: processedConnections,
	};

	const clusterPartners = instanceManagerGroups({
		instances: hydratedInstances.filter(
			(i) => instanceAuths[i.compute_stack_id] && i.compute_stack_id !== compute_stack_id
		),
		network,
		instance_region: thisInstance.instance_region,
		instance_wavelength_zone_id: thisInstance.wavelength_zone_id,
		instance_cluster_engine: thisInstance.clustering.engine,
	});

	const clusterDataTable = datatableFormat({
		instances: clusterPartners.connected.filter((i) => i.connection.state !== 'closed'),
		structure: thisInstance.structure,
	});

	const clusterDataTableColumns = datatableRows({
		auth,
		url: thisInstance.url,
		compute_stack_id,
		buildNetwork: () => buildNetwork({ auth, url, instances, compute_stack_id, instanceAuths, setLoading }),
		setLoading,
	});

	instanceState.update((s) => {
		s.network = network;
		s.clusterPartners = clusterPartners;
		s.clusterDataTable = clusterDataTable;
		s.clusterDataTableColumns = clusterDataTableColumns;
		s.instances = hydratedInstances;
	});

	setLoading(false);

	return {
		network,
		clusterPartners,
		clusterDataTable,
		clusterDataTableColumns,
	};
};

export default buildNetwork;
