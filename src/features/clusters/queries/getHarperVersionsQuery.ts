import { apiClient } from '@/config/apiClient';
import { queryOptions } from '@tanstack/react-query';

export interface HarperVersionsResponse {
	name: string;
	description: string;
	value: HarperVersion[];
}

interface HarperVersion {
	name: 'stable' | 'next' | 'current';
	version: string;
}

async function getHarperVersions() {
	// TODO: OpenAPI from CM is erroring, so this new endpoint isn't described.
	const { data } = await apiClient.get(`/HarperVersions/` as any);
	return data as HarperVersionsResponse;
}

export function getHarperVersionsOptions() {
	return queryOptions({
		queryKey: ['HarperVersions'],
		queryFn: getHarperVersions,
		staleTime: 60_000,
		retry: false,
	});
}
