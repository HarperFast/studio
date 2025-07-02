import React from 'react';
import { Button } from 'reactstrap';

export default ({ initializing, loading, handleClick }) => [
	{
		Header: 'instance name',
		accessor: 'instance_name',
	},
	{
		Header: 'instance url',
		accessor: 'url',
	},
	{
		Header: 'cf capable',
		id: 'hdb-narrow-cfcapable',
		Cell: ({
			row: {
				original: { custom_functions_status },
			},
		}) => (custom_functions_status.error ? 'no' : 'yes'),
	},
	{
		Header: 'cf enabled',
		id: 'hdb-narrow-cfenabled',
		Cell: ({
			row: {
				original: { custom_functions_status },
			},
		}) => (custom_functions_status.is_enabled ? 'yes' : 'no'),
	},
	{
		Header: 'has project',
		id: 'hdb-narrow-cfhasproject',
		Cell: ({
			row: {
				original: { has_current_project },
			},
		}) => (has_current_project ? 'yes' : 'no'),
	},
	{
		Header: 'deploy',
		id: 'hdb-narrow-deploy',
		Cell: ({
			row: {
				original: { compute_stack_id, custom_functions_status, has_auth },
			},
		}) =>
			custom_functions_status.is_enabled && has_auth ? (
				<Button
					color="success"
					block
					size="sm"
					disabled={initializing || loading[compute_stack_id]}
					onClick={() => handleClick(compute_stack_id, 'deploy')}
				>
					<i className={`fa ${loading[compute_stack_id] === 'deploy' ? 'fa-spinner fa-spin' : 'fa-share'}`} />
				</Button>
			) : null,
	},
	{
		Header: 'remove',
		id: 'hdb-narrow-remove',
		Cell: ({
			row: {
				original: { compute_stack_id, custom_functions_status, has_current_project, has_auth },
			},
		}) =>
			custom_functions_status.is_enabled && has_current_project && has_auth ? (
				<Button
					color="danger"
					block
					size="sm"
					disabled={loading[compute_stack_id]}
					onClick={() => handleClick(compute_stack_id, 'drop')}
				>
					<i className={`fa ${loading[compute_stack_id] === 'drop' ? 'fa-spinner fa-spin' : 'fa-trash'}`} />
				</Button>
			) : null,
	},
];
