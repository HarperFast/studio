import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { readResponseRefusal } from '@/integrations/api/readResponseRefusal';
import {
	resolveInstanceConnection,
	ResolveInstanceConnectionParams,
} from '@/integrations/api/sse/resolveInstanceConnection';
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

interface ComponentArchiveParams {
	connection: ResolveInstanceConnectionParams;
	project: string;
	skipNodeModules: boolean;
	signal?: AbortSignal;
}

/** As long as the buffered `package_component` above is given, since a retry builds the whole archive again. */
const ARCHIVE_TIMEOUT_MS = 300_000;

/**
 * `project`'s files as a gzipped tarball, streamed (`stream: true`, Harper 5.4) rather than base64 in JSON, which
 * holds several times the archive in Harper's shared process. Direct connections only: Fabric Connect relays JSON.
 */
export async function fetchComponentArchive({
	connection,
	project,
	skipNodeModules,
	signal,
}: ComponentArchiveParams): Promise<Blob> {
	const { url, headers, credentials, mode } = resolveInstanceConnection(connection);
	if (mode === 'proxy') {
		throw new Error('Packaging an application for a deploy needs a direct connection, not Fabric Connect.');
	}
	const response = await fetch(url, {
		method: 'POST',
		headers: { ...headers, Accept: 'application/octet-stream' },
		credentials,
		body: JSON.stringify({
			operation: 'package_component',
			project,
			skip_node_modules: skipNodeModules,
			stream: true,
		}),
		signal: signal
			? AbortSignal.any([signal, AbortSignal.timeout(ARCHIVE_TIMEOUT_MS)])
			: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS),
	});
	if (!response.ok) {
		const refusal = await readResponseRefusal(response);
		throw new Error(refusal ?? `Harper couldn't package ${project} (status ${response.status}).`);
	}
	if ((response.headers.get('content-type') ?? '').includes('application/json')) {
		await response.body?.cancel().catch(() => {});
		throw new Error(`Harper answered with JSON rather than an archive of ${project}.`);
	}
	return response.blob();
}

export function usePackageComponentMutation() {
	return useMutation({
		mutationFn: packageComponent,
	});
}
