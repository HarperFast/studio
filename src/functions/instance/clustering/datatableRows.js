import React from 'react';
import ToggleButton from 'react-toggle';

import updateNode from '../../api/instance/updateNode';

export default ({ auth, url, buildNetwork, setLoading }) => [
	{
		Header: 'instance',
		Cell: ({
			row: {
				original: { is_first_instance, instance_name },
			},
		}) => <div className={`${is_first_instance ? 'text-bold' : 'text-grey'}`}>{instance_name}</div>,
	},
	{
		Header: 'schema', // change to 'database' if instance version is 4.2+ and clustering available in studio cloud instances.
		Cell: ({
			row: {
				original: { is_first_schema, schema },
			},
		}) => <div className={`${is_first_schema ? 'text-bold' : 'text-grey'}`}>{schema}</div>,
	},
	{
		Header: 'table',
		accessor: 'table',
	},
	{
		Header: 'publish',
		id: 'hdb-narrow-publish',
		Cell: ({
			row: {
				original: {
					compute_stack_id,
					instance_host,
					instance_name,
					clusterPort,
					clusterName,
					subscriptions,
					publish,
					channel,
				},
			},
		}) => (
			<ToggleButton
				checked={publish || false}
				onChange={async () => {
					setLoading(compute_stack_id);
					await updateNode({
						channel,
						subscriptions,
						instance_host,
						instance_name,
						clusterPort,
						clusterName,
						auth,
						url,
						buttonState: 'togglePublish',
					});
					buildNetwork();
				}}
			/>
		),
	},
	{
		Header: 'subscribe',
		id: 'hdb-narrow-subscribe',
		Cell: ({
			row: {
				original: {
					compute_stack_id,
					instance_host,
					instance_name,
					clusterPort,
					clusterName,
					subscriptions,
					subscribe,
					channel,
				},
			},
		}) => (
			<ToggleButton
				checked={subscribe || false}
				onChange={async () => {
					setLoading(compute_stack_id);
					await updateNode({
						channel,
						subscriptions,
						instance_host,
						instance_name,
						clusterPort,
						clusterName,
						auth,
						url,
						buttonState: 'toggleSubscribe',
					});
					buildNetwork();
				}}
			/>
		),
	},
];
