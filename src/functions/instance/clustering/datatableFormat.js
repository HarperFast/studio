import deepmerge from 'deepmerge';

export default ({ instances, structure }) => {
	if (!structure || !instances.length) return [];

	const newTableData = [];
	instances.map((instance) => {
		const combinedStructure = deepmerge(instance.structure, structure);
		Object.keys(combinedStructure)
			.sort()
			.map((schema, s) => {
				Object.keys(combinedStructure[schema])
					.sort()
					.map((table, t) => {
						const channel = `${schema}:${table}`;
						const channelSubscription = channel && instance.subscriptions.find((sub) => sub.channel === channel);
						const publish = channelSubscription && channelSubscription.publish;
						const subscribe = channelSubscription && channelSubscription.subscribe;
						newTableData.push({
							is_first_instance: s === 0 && t === 0,
							is_first_schema: t === 0,
							instance_name: instance.instance_name,
							schema,
							table,
							compute_stack_id: instance.compute_stack_id,
							instance_host: instance.instance_host,
							clusterPort: instance.clusterPort,
							clusterName: instance.clusterName,
							subscriptions: instance.subscriptions,
							channel,
							publish,
							subscribe,
						});
						return true;
					});
				return true;
			});
		return true;
	});

	return newTableData;
};
