import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { useMutation, UseMutationOptions } from '@tanstack/react-query';

export interface SetComponentFileRequest extends InstanceClientIdConfig, InstanceTypeConfig {
	file: string;
	payload?: string;
	project: string;
	encoding?: 'utf8' | 'ASCII' | 'binary' | 'hex' | 'base64' | 'utf16le' | 'latin1' | 'ucs2';
}

export async function setComponentFile({
	file,
	payload,
	project,
	entityType,
	instanceClient,
	encoding,
}: SetComponentFileRequest) {
	const { data } = await instanceClient.post('/', {
		operation: 'set_component_file',
		file,
		payload,
		project,
		encoding,
		replicated: entityType === 'cluster',
	}, { timeout: 300_000 });
	return data;
}

export function useSetComponentFile(
	options?: Pick<UseMutationOptions<unknown, Error, SetComponentFileRequest>, 'onSuccess'>,
) {
	return useMutation({
		mutationFn: setComponentFile,
		...options,
	});
}
