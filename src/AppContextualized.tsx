import { ClusterProvider } from '@/features/cluster/context/ClusterAuthContext';

import { AppRouted } from '@/AppRouted';

export function AppContextualized() {
	return <ClusterProvider>
		<AppRouted />
	</ClusterProvider>;
}
