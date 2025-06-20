import { useParams } from '@tanstack/react-router';
import { getRegistrationInfoQueryOptions } from '@/features/instance/operations/queries/getRegistrationInfo.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getConfigurationQueryOptions } from '@/features/instance/operations/queries/getConfiguration.ts';
import Editor from '@monaco-editor/react';
import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button.tsx';

export function ConfigOverviewIndex() {
	const { instanceId } = useParams({ strict: false });
	const {
		data: registrationInfo,
		isLoading: loadingRegistration,
	} = useSuspenseQuery(getRegistrationInfoQueryOptions(instanceId));
	const {
		data: configurationInfo,
		isLoading: loadingConfig,
	} = useSuspenseQuery(getConfigurationQueryOptions(instanceId));
	return <>
		<dl className="grid grid-cols-1 sm:grid-cols-3">
			<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
				<dt className="text-sm/6 font-bold">Instance URL</dt>
				<dd className="text-sm/6 sm:mt-2">http://localhost:9925</dd>
			</div>
			<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
				<dt className="text-sm/6 font-bold">Application URL</dt>
				<dd className="text-sm/6 sm:mt-2">http://localhost:9926</dd>
			</div>
			<div className="px-4 pb-4 sm:col-span-1 sm:px-0 text-right">
				<Button variant="destructiveOutline" className="rounded-full cursor-pointer">
					Remove Instance
				</Button>
				<Button variant="positiveOutline" className="rounded-full ml-4 cursor-pointer">
					Restart Instance
				</Button>
			</div>
			<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
				<dt className="text-sm/6 font-bold">Instance Node Name (for clustering)</dt>
				<dd className="text-sm/6 sm:mt-2">clustering not enabled</dd>
			</div>
			<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
				<dt className="text-sm/6 font-bold">Created</dt>
				<dd className="text-sm/6 sm:mt-2">N/A</dd>
			</div>
			<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
				<dt className="text-sm/6 font-bold">Total Price</dt>
				<dd className="text-sm/6 sm:mt-2">FREE</dd>
			</div>
			<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
				<dt className="text-sm/6 font-bold">Harper Version</dt>
				<dd className="text-sm/6 sm:mt-2">{loadingRegistration ? '...' : registrationInfo.version}</dd>
			</div>
			<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
				<dt className="text-sm/6 font-bold">RAM</dt>
				<dd className="text-sm/6 sm:mt-2">{loadingRegistration ? '...' : registrationInfo.ram_allocation} MB</dd>
			</div>
		</dl>
		<div>
			<h3 className="text-sm/6 font-bold">Instance Config (read only)</h3>
			{!loadingConfig ? (
				<Editor
					className="w-full h-96 min-h-full"
					language="json"
					theme="vs-dark"
					options={{ readOnly: true, scrollBeyondLastLine: false }}
					value={JSON.stringify(configurationInfo, null, 4)}
				/>
			) : (
				<Loading />
			)}
		</div>
	</>;
}
