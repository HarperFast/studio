/**
 * Key-level `.env` operations (Harper >= 5.2, HarperFast/harper#1527).
 *
 * On these versions `get_component_file` masks secret-bearing `.env` files (`protected: true`),
 * so the editor can no longer read-modify-write the whole file. These operations edit single
 * keys server-side instead, preserving every other key, comment, and formatting — and never
 * echo values back.
 */
import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

/** Both operations respond with the resulting key list (names only — never values). */
export interface EnvValueResponse {
	message: string;
	keys: string[];
}

export interface SetEnvValueRequest extends InstanceClientConfig, InstanceTypeConfig {
	project: string;
	file: string;
	key: string;
	value: string;
}

export async function setEnvValue({
	instanceClient,
	entityType,
	project,
	file,
	key,
	value,
}: SetEnvValueRequest): Promise<EnvValueResponse> {
	const { data } = await instanceClient.post<EnvValueResponse>('/', {
		operation: 'set_env_value',
		project,
		file,
		key,
		value,
		replicated: entityType === 'cluster',
	});
	return data;
}

export function useSetEnvValue() {
	return useMutation({ mutationFn: setEnvValue });
}

export interface DeleteEnvValueRequest extends InstanceClientConfig, InstanceTypeConfig {
	project: string;
	file: string;
	key: string;
}

export async function deleteEnvValue({
	instanceClient,
	entityType,
	project,
	file,
	key,
}: DeleteEnvValueRequest): Promise<EnvValueResponse> {
	const { data } = await instanceClient.post<EnvValueResponse>('/', {
		operation: 'delete_env_value',
		project,
		file,
		key,
		replicated: entityType === 'cluster',
	});
	return data;
}

export function useDeleteEnvValue() {
	return useMutation({ mutationFn: deleteEnvValue });
}
