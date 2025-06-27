import { getRouteApi, Navigate, Outlet, useMatchRoute } from '@tanstack/react-router';

const route = getRouteApi('');

export function OrganizationIndex() {
	const { organizationId } = route.useParams();
	const matchRoute = useMatchRoute();
	const match = matchRoute({ to: '/orgs/$organizationId' });
	if (match) {
		return <Navigate to={`${organizationId}/clusters`} />;
	} else {
		return <Outlet />;
	}
}


