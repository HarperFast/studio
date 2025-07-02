import { lazy, React } from 'react';

const Users = lazy(() => import(/* webpackChunkName: "organization-users" */ './users'));
const Billing = lazy(() => import(/* webpackChunkName: "organization-billing" */ './billing'));

const Routes = () => [
	{
		element: <Users />,
		path: `users/:user_id?`,
		link: `users`,
		label: 'users',
		icon: 'users',
		iconCode: 'f0c0',
	},
	{
		element: <Billing />,
		path: `billing`,
		link: `billing`,
		label: 'billing',
		icon: 'credit-card-alt',
		iconCode: 'f283',
	},
];

export default Routes;
