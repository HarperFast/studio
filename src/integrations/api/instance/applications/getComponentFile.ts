import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { hasImageFileExtension } from '@/lib/string/hasImageFileExtension';
import { queryOptions } from '@tanstack/react-query';

interface GetComponentFileRequest extends InstanceClientIdConfig {
	file: string | undefined;
	project: string | undefined;
	encoding?: 'utf8' | 'ASCII' | 'binary' | 'hex' | 'base64' | 'utf16le' | 'latin1' | 'ucs2';
}

export interface GetComponentFileResponse {
	file: string;
	project: string;
	birthtime: string;
	message: string;
	mtime: string;
	size: number;
}

export async function getComponentFile({
	instanceClient,
	file,
	project,
	encoding,
}: GetComponentFileRequest): Promise<GetComponentFileResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'get_component_file',
		file,
		project,
		encoding: encoding ?? (hasImageFileExtension(file) ? 'base64' : 'utf8'),
	});
	return {
		file,
		project,
		...data,
	};
}

export function getComponentFileQueryOptions(params: GetComponentFileRequest) {
	return queryOptions({
		queryKey: getComponentFileQueryKey(params),
		queryFn: () => getComponentFile(params),
		enabled: !!params.file && !!params.project,
		retry: false,
	});
}

export function getComponentFileQueryKey(params: GetComponentFileRequest) {
	return [
		params.entityId,
		"get_component_file",
		params.file,
		params.project,
		params.encoding,
	] as const;
}
