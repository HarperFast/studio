import { apiClient } from '@/config/apiClient';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Central manager's staff-only `/Admin/ClusterMonitoringPolicy` endpoint. Hand-typed: the generated SDK
 * does not carry these paths, so URLs are cast as elsewhere. The endpoint enforces every permission the
 * page gates on (cluster:read, monitoringPolicy:write, and the restart rights `apply: rolling` needs).
 */
export type MonitoringPolicy = 'page' | 'notify';
export type MonitoringPolicyApply = 'none' | 'rolling';

export interface MonitoringPolicyChange {
	monitoringPolicy: MonitoringPolicy;
	reason?: string | null;
	setBy?: string | null;
	setAt?: string | null;
}

export interface MonitoringPolicyProjectionError {
	target: string;
	error?: string | null;
	at?: string | null;
}

/** Outcome of the last synthetic-check projection; its `setAt` names the change it projected. */
export interface MonitoringPolicyCheckProjection {
	setAt?: string | null;
	finishedAt?: string | null;
	errors?: MonitoringPolicyProjectionError[] | null;
	skipped?: string | null;
}

export interface ClusterMonitoringPolicyRow extends MonitoringPolicyChange {
	clusterId: string;
	organizationId: string;
	clusterName?: string | null;
	organizationName?: string | null;
	history?: MonitoringPolicyChange[] | null;
	checkProjection?: MonitoringPolicyCheckProjection | null;
}

/** One `?search=` match: the cluster with its effective policy (`page` when it has no row). */
export interface ClusterPolicySearchResult extends MonitoringPolicyChange {
	clusterId: string;
	clusterName: string;
	clusterStatus?: string | null;
	organizationId: string;
	organizationName: string;
}

export interface SetMonitoringPolicyRequest {
	clusterId: string;
	monitoringPolicy: MonitoringPolicy;
	reason: string;
	apply: MonitoringPolicyApply;
}

export interface SetMonitoringPolicyResult extends MonitoringPolicyChange {
	clusterId: string;
	apply: MonitoringPolicyApply;
	instanceIds: string[];
	projectionErrors: MonitoringPolicyProjectionError[];
	restart: { status?: string; instanceIds?: string[]; message?: string } | null;
	applyError: string | null;
}

const BASE = '/Admin/ClusterMonitoringPolicy/';

export const monitoringPolicyQueryKey = ['fabric-admin', 'monitoring-policy'] as const;

export async function getNotifyPolicies(): Promise<ClusterMonitoringPolicyRow[]> {
	const { data } = await apiClient.get(`${BASE}?monitoringPolicy=notify` as '/Cluster/');
	return data as unknown as ClusterMonitoringPolicyRow[];
}

export function notifyPoliciesQueryOptions() {
	return queryOptions({
		queryKey: [...monitoringPolicyQueryKey, 'notify'],
		queryFn: getNotifyPolicies,
	});
}

export async function searchClusterPolicies(term: string): Promise<ClusterPolicySearchResult[]> {
	const { data } = await apiClient.get(`${BASE}?search=${encodeURIComponent(term)}` as '/Cluster/');
	return data as unknown as ClusterPolicySearchResult[];
}

/** Callers never send a blank term: the endpoint would answer stored rows instead of search matches. */
export function clusterPolicySearchQueryOptions(term: string) {
	return queryOptions({
		queryKey: [...monitoringPolicyQueryKey, 'search', term],
		queryFn: () => searchClusterPolicies(term),
		enabled: term.length > 0,
		staleTime: 10_000,
	});
}

/**
 * PATCH the policy. Failures toast through the global MutationCache handler, which already words an
 * unanswered write as "outcome unknown". Every settle refetches, because a failed answer can still be a
 * committed write.
 */
export function useSetMonitoringPolicyMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ clusterId, ...body }: SetMonitoringPolicyRequest) => {
			const { data } = await apiClient.patch(`${BASE}${encodeURIComponent(clusterId)}` as '/Cluster/{id}', body);
			return data as unknown as SetMonitoringPolicyResult;
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: monitoringPolicyQueryKey }),
	});
}
