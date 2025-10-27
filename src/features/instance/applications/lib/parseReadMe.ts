import { GetComponentFileResponse } from '@/features/instance/operations/queries/getComponentFile';

export function parseReadMe(contents: string, baseURL: string, response: GetComponentFileResponse): string {
	const operations9925URL = baseURL;
	const rest9926URL = baseURL.replace(':9925', '');
	if (operations9925URL) {
		contents = contents.replace(/http:\/\/localhost:9926/g, rest9926URL);
	}
	if (response.project) {
		contents = contents.replace(/Your New Harper Fabric App/g, response.project);
	}
	return contents;
}
