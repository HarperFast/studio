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
		// A read, but every attempt builds the whole archive again.
		{ timeout: 300_000, skipGatewayRetry: true },
	);
	return data;
}

export function usePackageComponentMutation() {
	return useMutation({
		mutationFn: packageComponent,
	});
}
