import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export type NewInstanceInfo = {
	name: string;
	instanceTypeId: string;
	clusterId: string;
	url: string;
	storage: number;
	operationsApiPort: number;
	operationsApiSecure: boolean;
};

type NewInstanceInfoResponse = {
	id: string;
	status: 'PROVISIONING' | 'RUNNING' | 'STOPPED' | 'TERMINATED';
	instanceTypeId: string;
	hostId: string;
	createdByUserId: string;
	clusterId: string;
	name: string;
	version: string;
	url: string[];
	replicationHosts: string[];
	tempPassword: string;
};

export async function onNewInstanceSubmit({
	name,
	instanceTypeId,
	url,
	clusterId,
	storage,
	operationsApiPort,
	operationsApiSecure,
}: NewInstanceInfo): Promise<NewInstanceInfoResponse> {
	const { data } = await apiClient.post('/HDBInstance/', {
		name,
		instanceTypeId,
		clusterId,
		storage,
		instanceFqdn: url,
		hostId: 'hos-zyknwmtjs3obunoy',
		gtmFqdn: 'gtmFqdn',
		operationsApiPort,
		operationsApiSecure,
	});
	if (data) {
		// TODO: We need to work through the disagreements between the SchemaHdbInstance type and our local type here.
		return data as never as NewInstanceInfoResponse;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useCreateNewInstanceMutation() {
	return useMutation<NewInstanceInfoResponse, Error, NewInstanceInfo>({
		mutationFn: (clusterInfo) => onNewInstanceSubmit(clusterInfo),
	});
}
