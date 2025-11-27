import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

export interface SetComponentFileRequest extends InstanceClientConfig, InstanceTypeConfig {
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

export function useSetComponentFile() {
	return useMutation({
		mutationFn: setComponentFile,
	});
}
