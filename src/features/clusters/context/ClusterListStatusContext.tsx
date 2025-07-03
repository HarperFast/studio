import { createContext, useState, PropsWithChildren, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';

type ClusterListContextValue = {
	clusters: object[];
	isClustersLoading: boolean;
	fetchClusters: () => void;
	setClusters: (clusters: object[]) => void;
	checkStatuses: (clusters: object[]) => void;
};

const ClusterListWithStatusContext = createContext<ClusterListContextValue | null>(null);

const ClusterListStatusProvider = ({ children }: PropsWithChildren) => {
	const [clusters, setClusters] = useState<object[]>([]);
	const [isClustersLoading, setIsClustersLoading] = useState<boolean>(true);

	const fetchClusters = useCallback(() => {
		const { data, isLoading } = useQuery(getOrganizationQueryOptions(orgId), {
			onSuccess: (data) => {
				setClusters(data);
				setIsClustersLoading(false);
			},
			onError: () => {
				setIsClustersLoading(false);
			},
		});
	}, []);

	const checkStatuses = useCallback((clusters: object[]) => {
		// Logic to check statuses of clusters
	}, []);

	useEffect(() => {
		if (data) {
			setClusters(data);
		}
		setIsClustersLoading(isLoading);
	}, [data, isLoading]);

	return (
		<ClusterListWithStatusContext.Provider
			value={{ clusters, isClustersLoading, fetchClusters, setClusters, checkStatuses }}
		>
			{children}
		</ClusterListWithStatusContext.Provider>
	);
};

export { ClusterListStatusProvider, ClusterListWithStatusContext };
export type { ClusterListContextValue };
