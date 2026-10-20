import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { isMediaFile } from '@/lib/string/mediaFileType';
import { QueryFilters, queryOptions } from '@tanstack/react-query';

interface GetComponentFileRequest extends InstanceClientIdConfig {
	project: string | undefined;
	file: string | undefined;
	encoding?: 'utf8' | 'ASCII' | 'binary' | 'hex' | 'base64' | 'utf16le' | 'latin1' | 'ucs2';
}

export interface GetComponentFileResponse {
	project: string;
	file: string;
	birthtime: string;
	message: string;
	/** Unknown once an editor save has set the entry, since `set_component_file` doesn't report it. */
	mtime?: string;
	size: number;
	/**
	 * Harper >= 5.2 marks secret-bearing `.env` files as protected: `message` is a value-free
	 * `KEY=********` rendering, `keys` lists the key names, and the real values are never
	 * returned. Older versions return the raw file text with neither field.
	 */
	protected?: boolean;
	keys?: string[];
}

export async function getComponentFile({
	instanceClient,
	file,
	project,
	encoding,
}: GetComponentFileRequest): Promise<GetComponentFileResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'get_component_file',
		project,
		file,
		encoding: encoding ?? (isMediaFile(file) ? 'base64' : 'utf8'),
	});
	return {
		project,
		file,
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
		'get_component_file',
		params.project,
		params.file,
		params.encoding,
	] as const;
}

/** In every encoding it was loaded with; `path` can also be a folder or a bare project. */
export function componentFilesAtOrUnder(entityId: string, path: string): QueryFilters {
	return {
		queryKey: [entityId, 'get_component_file'],
		predicate: ({ queryKey: [, , project, file] }) => {
			if (typeof project !== 'string') {
				return false;
			}
			const cached = file ? `${project}/${file}` : project;
			return cached === path || cached.startsWith(`${path}/`);
		},
	};
}
