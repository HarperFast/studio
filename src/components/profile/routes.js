import { lazy, React } from 'react';

const Profile = lazy(() => import(/* webpackChunkName: "profile" */ './profile'));

const Routes = [
	{
		element: <Profile />,
		path: '',
		link: 'profile',
		label: 'profile',
		icon: 'user',
		iconCode: 'f007',
	},
];

export default Routes;
