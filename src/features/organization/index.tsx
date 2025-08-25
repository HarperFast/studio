import { getRouteApi, Navigate, Outlet, useMatchRoute } from '@tanstack/react-router';

const route = getRouteApi('');

export function OrganizationIndex() {
	const { organizationId }: { organizationId: string; } = route.useParams();
	const matchRoute = useMatchRoute();
	const match = matchRoute({ to: '/orgs/$organizationId' });
	if (match) {
		return <Navigate to={`/orgs/${organizationId}/clusters`} />;
	} else {
		return <Outlet />;
	}
}
