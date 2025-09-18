import { useInstanceClient } from '@/config/useInstanceClient';
import { installUsageLicense } from '@/features/instance/operations/mutations/installUsageLicense';
import { getInstanceUserInfo } from '@/features/instance/operations/queries/getInstanceUserInfo';
import { SchemaLicense } from '@/lib/api.gen';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { sleep } from '@/lib/sleep';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

interface ApplyLicensesClickParams {
	licenses: SchemaLicense[];
}

interface ApplyLicensesClickResponse {
	onApplyLicensesClick: () => void;
	isApplyLicensesPending: boolean;
}

export function useApplyLicensesClick({ licenses }: ApplyLicensesClickParams): ApplyLicensesClickResponse {
	const instanceClient = useInstanceClient();
	const [isApplyLicensesPending, setIsApplyLicensesPending] = useState(false);
	const onApplyLicensesClick = useCallback(async () => {
		setIsApplyLicensesPending(true);

		let canceled = false;
		const toastConfig = {
			duration: 60_000,
			action: {
				label: 'Cancel',
				onClick: () => {
					canceled = true;
				},
			},
		};

		const toastId = toast.loading('Applying Licenses', {
			...toastConfig,
			description: renderProgressUpdate(),
		});

		let licensesApplied = 0;

		for (let i = 0; i < licenses.length; i++) {
			const license = licenses[i];
			if (!canceled) {
				toast.loading(licenses.length === 1
					? 'Applying License'
					: `Applying License ${i + 1} of ${licenses.length}`, {
					...toastConfig,
					id: toastId,
					description: renderProgressUpdate(i, licenses.length),
				});
				try {
					// Make sure the instance is responding.
					await getInstanceUserInfo({
						instanceClient,
					});
					// Then install the usage license to it.
					await installUsageLicense({
						license: license.license,
						instanceClient,
					});
					licensesApplied += 1;
				} catch {
					if (i + 1 !== licenses.length) {
						// If it fails to applyLicenses, or wasn't available, warn for a bit then move on.
						toast.loading(`Failed Applying License ${i + 1} of ${licenses.length}`, {
							...toastConfig,
							id: toastId,
							description: 'We will carry on momentarily.',
						});
						await sleep(3000);
					}
				}
			}
		}

		setIsApplyLicensesPending(false);

		const licenseWord = licenses.length === 1 ? 'License' : 'Licenses';
		if (canceled) {
			toast.error('Cancelled', {
				id: toastId,
				description: `Applying the ${licenseWord.toLowerCase()} was partially cancelled.`,
				duration: 10_000,
				action: {
					label: 'Dismiss',
					onClick: () => toast.dismiss(),
				},
			});
		} else if (licenses.length === licensesApplied) {
			toast.success('Success', {
				id: toastId,
				description: `${licenseWord} applied!\nPlease restart your instance.`,
				duration: 10_000,
				action: {
					label: 'Dismiss',
					onClick: () => toast.dismiss(),
				},
			});
		} else {
			toast.error('Error', {
				id: toastId,
				description: `${licenseWord} not applied.\n`
					+ [
						licensesApplied > 0 && licenses.length !== licensesApplied && `${licensesApplied} of ${licenses.length} ${licenseWord.toLowerCase()} applied.`,
					].filter(excludeFalsy)[0],
				duration: 10_000,
				action: {
					label: 'Dismiss',
					onClick: () => toast.dismiss(),
				},
			});
		}
	}, [instanceClient, licenses]);


	return {
		onApplyLicensesClick,
		isApplyLicensesPending,
	};
}

function renderProgressUpdate(current?: number, total?: number) {
	return (<>
		{current !== undefined && total !== undefined && total > 0 && (
			<div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
				<div className="bg-purple-600 h-2.5 rounded-full dark:bg-purple-500" style={{ width: (current === 0 ? 0 : (current / total * 100)) + '%' }}></div>
			</div>)}
		<div className="text-xs mt-2">Please don't close your browser or navigate away. This may take a bit.</div>
	</>);
}
