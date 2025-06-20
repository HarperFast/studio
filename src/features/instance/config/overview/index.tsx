import { useParams } from '@tanstack/react-router';
import { getRegistrationInfoQueryOptions } from '@/features/instance/operations/queries/getRegistrationInfo.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getConfigurationQueryOptions } from '@/features/instance/operations/queries/getConfiguration.ts';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button.tsx';
import { RemoveInstanceModal } from '../../modals/RemoveInstanceModal';
import { useState } from 'react';
import { TextLoadingSkeleton } from '@/components/text-loading-skeleton';

export function ConfigOverviewIndex() {
	const { instanceId } = useParams({ strict: false });
	const [isRemoveInstanceModalOpen, setIsRemoveInstanceModalOpen] = useState(false);

	const { data: registrationInfo, isLoading: loadingRegistration } = useSuspenseQuery(
		getRegistrationInfoQueryOptions(instanceId)
	);
	const { data: configurationInfo, isLoading: loadingConfig } = useSuspenseQuery(
		getConfigurationQueryOptions(instanceId)
	);
	return (
		<>
			<dl className="grid grid-cols-1 sm:grid-cols-3">
				<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
					<dt className="font-bold text-sm/6">Instance URL</dt>
					<dd className="text-sm/6 sm:mt-2"><TextLoadingSkeleton /></dd>
				</div>
				<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
					<dt className="font-bold text-sm/6">Application URL</dt>
					<dd className="text-sm/6 sm:mt-2"><TextLoadingSkeleton /></dd>
				</div>
				<div className="px-4 pb-4 text-right sm:col-span-1 sm:px-0">
					<Button
						variant="destructiveOutline"
						className="rounded-full cursor-pointer"
						onClick={() => setIsRemoveInstanceModalOpen(true)}
					>
						Remove Instance
					</Button>
					<Button variant="positiveOutline" className="ml-4 rounded-full cursor-pointer">
						Restart Instance
					</Button>
				</div>
				<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
					<dt className="font-bold text-sm/6">Instance Node Name (for clustering)</dt>
					<dd className="text-sm/6 sm:mt-2"><TextLoadingSkeleton /></dd>
				</div>
				<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
					<dt className="font-bold text-sm/6">Created</dt>
					<dd className="text-sm/6 sm:mt-2"><TextLoadingSkeleton /></dd>
				</div>
				<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
					<dt className="font-bold text-sm/6">Total Price</dt>
					<dd className="text-sm/6 sm:mt-2"><TextLoadingSkeleton className="w-10" /></dd>
				</div>
				<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
					<dt className="font-bold text-sm/6">Harper Version</dt>
					<dd className="text-sm/6 sm:mt-2">{loadingRegistration ? <TextLoadingSkeleton className="w-10" /> : registrationInfo.version}</dd>
				</div>
				<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
					<dt className="font-bold text-sm/6">RAM</dt>
					<dd className="text-sm/6 sm:mt-2">{loadingRegistration ? <TextLoadingSkeleton className="w-10" /> : registrationInfo.ram_allocation} MB</dd>
				</div>
			</dl>
			<div>
				<h3 className="font-bold text-sm/6">Instance Config (read only)</h3>
				{!loadingConfig ? (
					<Editor
						className="w-full min-h-full h-96"
						language="json"
						theme="vs-dark"
						options={{ readOnly: true, scrollBeyondLastLine: false }}
						value={JSON.stringify(configurationInfo, null, 4)}
					/>
				) : (
					<>
						<TextLoadingSkeleton className="w-full" />
						<TextLoadingSkeleton className="w-full" />
						<TextLoadingSkeleton className="w-1/2" />
					</>
				)}
			</div>
			<RemoveInstanceModal isModalOpen={isRemoveInstanceModalOpen} setIsModalOpen={setIsRemoveInstanceModalOpen} />
		</>
	);
}
