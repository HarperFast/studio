import { GetComponentFileResponse } from '@/features/instance/operations/queries/getComponentFile';

export function parseReadMe(contents: string, baseURL: string, response: Pick<GetComponentFileResponse, 'project'>): string {
	const operations9925URL = baseURL;
	const rest9926URL = baseURL.replace(/:9925\/?/, '');
	if (operations9925URL) {
		contents = contents.replaceAll(/https?:\/\/localhost:9926/g, rest9926URL);
	}
	if (response.project) {
		contents = contents.replaceAll('Your New Harper Fabric App', response.project);
	}
	return contents;
}
