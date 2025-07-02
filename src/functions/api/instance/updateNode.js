import queryInstance from '../queryInstance';
import instanceState from '../../state/instanceState';

export default async ({ channel, subscriptions, buttonState, instance_host, clusterPort, clusterName, auth, url }) => {
	const newSubscriptions = JSON.parse(JSON.stringify(subscriptions));
	const existingChannelSubscriptionIndex = newSubscriptions.findIndex((s) => s.channel === channel);
	const [schema, table] = channel.split(':');

	// if we have no subscription for this node, add it to the subscriptions array
	if (existingChannelSubscriptionIndex === -1) {
		newSubscriptions.push({
			channel,
			schema,
			table,
			publish: buttonState === 'togglePublish',
			subscribe: buttonState === 'toggleSubscribe',
		});

		// if we're changing the publish status
	} else if (buttonState === 'togglePublish') {
		newSubscriptions[existingChannelSubscriptionIndex].publish =
			!newSubscriptions[existingChannelSubscriptionIndex].publish;

		// if we're changing the subscribe status
	} else if (buttonState === 'toggleSubscribe') {
		newSubscriptions[existingChannelSubscriptionIndex].subscribe =
			!newSubscriptions[existingChannelSubscriptionIndex].subscribe;
	}

	// get rid of subscription node if it's neither publishing or subscribing
	if (
		newSubscriptions[existingChannelSubscriptionIndex] &&
		!newSubscriptions[existingChannelSubscriptionIndex].publish &&
		!newSubscriptions[existingChannelSubscriptionIndex].subscribe
	) {
		// newSubscriptions.splice(existingChannelSubscriptionIndex, 1);
	}

	// send the query
	const operation = {
		operation: 'update_node',
		name: clusterName,
		node_name: clusterName,
		host: instance_host,
		port: clusterPort,
		subscriptions: newSubscriptions,
	};

	const updateResult = await queryInstance({
		operation,
		auth,
		url,
	});

	if (updateResult.error && updateResult.message.indexOf('add_node') !== -1) {
		operation.operation = 'add_node';
		await queryInstance({
			operation,
			auth,
			url,
		});
	}

	return instanceState.update((s) => {
		s.lastUpdate = Date.now();
	});
};
