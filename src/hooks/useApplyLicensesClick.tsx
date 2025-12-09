import { ProgressBar } from '@/components/ProgressBar';
import { useInstanceClient } from '@/config/useInstanceClient';
import { useRestartInstanceClick } from '@/hooks/useRestartInstanceClick';
import { SchemaLicense } from '@/integrations/api/api.gen';
import { installUsageLicense } from '@/integrations/api/instance/auth/installUsageLicense';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { sleep } from '@/lib/sleep';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
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
	const { instanceId }: { instanceId?: string } = useParams({ strict: false });
	const queryClient = useQueryClient();
	const { isRestartPending, onRestartClick } = useRestartInstanceClick({
		operation: 'restart_service',
		instanceClient,
	});

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
			description: (
				<ProgressBar
					animated={true}
					width="0%"
				/>
			),
		});

		let licensesApplied = 0;

		for (let i = 0; i < licenses.length; i++) {
			const license = licenses[i];
			if (!canceled) {
				toast.loading(
					licenses.length === 1
						? 'Applying License'
						: `Applying License ${i + 1} of ${licenses.length}`,
					{
						...toastConfig,
						id: toastId,
						description: (
							<ProgressBar
								animated={true}
								width={(i === 0 ? 0 : (i / licenses.length * 100)) + '%'}
							/>
						),
					},
				);
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

		void queryClient.invalidateQueries({ queryKey: [instanceId, 'get_configuration'], refetchType: 'active' });

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
				duration: 0,
				action: {
					label: 'Restart',
					onClick: () => {
						toast.dismiss(toastId);
						onRestartClick();
					},
				},
			});
		} else {
			toast.error('Error', {
				id: toastId,
				description: `${licenseWord} not applied.\n`
					+ ([
						licensesApplied > 0 && licenses.length !== licensesApplied
						&& `${licensesApplied} of ${licenses.length} ${licenseWord.toLowerCase()} applied.`,
					].filter(excludeFalsy).shift() || ''),
				duration: 10_000,
				action: {
					label: 'Dismiss',
					onClick: () => toast.dismiss(),
				},
			});
		}
	}, [instanceClient, instanceId, licenses, onRestartClick, queryClient]);

	return {
		onApplyLicensesClick,
		isApplyLicensesPending: isApplyLicensesPending || isRestartPending,
	};
}
