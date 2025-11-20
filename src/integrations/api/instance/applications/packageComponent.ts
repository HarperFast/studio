import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface PackageComponentParams {
	packageName?: string;
	project: string;
	skipNodeModules?: boolean;
	skipSymlinks?: boolean;
}

interface PackageResponse {
	payload: string;
}

async function packageComponent({
	packageName,
	project,
	skipNodeModules,
	skipSymlinks,
	instanceClient,
}: PackageComponentParams & InstanceClientConfig): Promise<PackageResponse> {
	const { data } = await instanceClient.post(
		'/',
		{
			operation: 'package_component',
			package: packageName,
			project,
			skip_node_modules: skipNodeModules,
			skip_symlinks: skipSymlinks,
		},
		{ timeout: 300_000 },
	);
	return data;
}

export function usePackageComponentMutation() {
	return useMutation({
		mutationFn: packageComponent,
	});
}
