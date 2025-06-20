import { useContext } from 'react';
import { ClusterAuthContext, ClusterContextValue } from '@/features/cluster/context/ClusterAuthContext';

export function useCluster() {
	return useContext(ClusterAuthContext) as ClusterContextValue;
}
