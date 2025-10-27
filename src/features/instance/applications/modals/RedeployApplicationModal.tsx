import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useDeployComponentMutation } from '@/features/instance/operations/mutations/deployComponent';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, RefreshCwIcon } from 'lucide-react';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export function RedeployApplicationModal() {
	const isModalOpen = useWatchedValue('ShowRedeployApplicationModal', false);

	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();

	const { openedEntry } = useEditorView();
	const packageUrl = openedEntry?.package;

	const { mutate: reDeployApplication, isPending } = useDeployComponentMutation();

	const redeployPackage = useCallback((applicationUrl: string, installCommand: string | undefined) => {
		if (!openedEntry) {
			return;
		}
		const originalPackageUrl = openedEntry.package;
		const toastId = toast.loading('Redeploying...');
		reDeployApplication({
			applicationName: openedEntry.project,
			applicationUrl,
			installCommand,
			...instanceParams,
		}, {
			onSuccess: () => {
				toast.success(
					`Application ${openedEntry.project} redeployed successfully`,
					{
						id: toastId,
					},
				);
				void queryClient.invalidateQueries({
					queryKey: [instanceParams.entityId, 'get_components'],
					refetchType: 'active',
				});
				setWatchedValue('ShowRedeployApplicationModal', false);
			},
			onError: () => {
				openedEntry.package = originalPackageUrl;
				toast.dismiss(toastId);
			},
		});
	}, [reDeployApplication, openedEntry, instanceParams, queryClient]);

	const methods = useForm({
		defaultValues: {
			applicationUrl: packageUrl,
			installCommand: '',
		},
	});

	const { control, handleSubmit, reset } = methods;

	const submitForm = ({ applicationUrl, installCommand }: {
		applicationUrl: string | undefined,
		installCommand: string | undefined
	}) => {
		if (applicationUrl) {
			redeployPackage(applicationUrl, installCommand);
		}
	};

	const modalClosed = useCallback(() => {
		setWatchedValue('ShowRedeployApplicationModal', false);
		reset({ applicationUrl: packageUrl });
	}, [reset, packageUrl]);

	return (
		<Dialog
			onOpenChange={modalClosed}
			open={isModalOpen}
		>
			<DialogContent aria-describedby={undefined} className="text-white">
				<DialogHeader>
					<DialogTitle>Redeploy Package</DialogTitle>
					<DialogDescription> Redeploy this package?</DialogDescription>
				</DialogHeader>

				<div>
					<Form {...methods}>
						<form className="flex flex-col w-full gap-4" onSubmit={handleSubmit(submitForm)}>
							<FormField
								control={control}
								name="applicationUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Package Reference</FormLabel>
										<FormControl>
											<Input
												type="text"
												autoFocus={true}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={control}
								name="installCommand"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Install Command</FormLabel>
										<FormControl>
											<Input
												type="text"
												placeholder="npm install"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								variant="positiveOutline"
								type="submit"
								className="w-full rounded-full"
								disabled={isPending}
							>
								<RefreshCwIcon /> Redeploy Application
							</Button>
							<Button
								type="button"
								variant="default"
								className="w-full rounded-full"
								onClick={modalClosed}
								disabled={isPending}
							>
								<Ban /> Cancel
							</Button>
						</form>
					</Form>
				</div>
			</DialogContent>
		</Dialog>
	);
}
