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
import { DeployProgress } from '@/features/instance/applications/components/DeployProgress/DeployProgress';
import { useDeploymentStream } from '@/features/instance/applications/components/DeployProgress/useDeploymentStream';
import { useComponentHealthCheck } from '@/features/instance/applications/hooks/useComponentHealthCheck';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useSupportsDeploymentSSE } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { useDeployComponentMutation } from '@/integrations/api/instance/applications/deployComponent';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { reportDeployHealth } from './reportDeployHealth';

export function RedeployApplicationModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowRedeployApplicationModal', false);

	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const sseDeploy = useSupportsDeploymentSSE();
	const stream = useDeploymentStream();
	const runHealthCheck = useComponentHealthCheck(instanceParams);

	const { openedEntry } = useEditorView();
	const packageUrl = openedEntry?.package;

	const { mutate: reDeployApplication, isPending } = useDeployComponentMutation();
	const [isStreaming, setIsStreaming] = useState(false);

	const methods = useForm({
		defaultValues: {
			applicationUrl: packageUrl,
			installCommand: '',
		},
	});

	const { control, handleSubmit, reset } = methods;

	useEffect(() => {
		reset({ applicationUrl: packageUrl });
	}, [reset, packageUrl]);

	const closeModal = useCallback(() => {
		setWatchedValue('ShowRedeployApplicationModal', false);
		attemptToRestoreFocus(trigger);
		reset({ applicationUrl: packageUrl });
		setIsStreaming(false);
		stream.reset();
	}, [reset, packageUrl, trigger, stream]);

	const invalidateComponents = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: [instanceParams.entityId, 'get_components'],
			refetchType: 'active',
		});
	}, [queryClient, instanceParams.entityId]);

	const redeployWithProgress = useCallback(
		(applicationUrl: string, installCommand: string | undefined) => {
			if (!openedEntry) {
				return;
			}
			const project = openedEntry.project;
			stream.reset();
			stream.markStarted();
			setIsStreaming(true);

			reDeployApplication(
				{
					applicationName: project,
					applicationUrl,
					installCommand,
					useSSE: true,
					onEvent: stream.onEvent,
					...instanceParams,
				},
				{
					onSuccess: async () => {
						stream.markSettled('success');
						invalidateComponents();
						const health = await runHealthCheck(project);
						reportDeployHealth(project, health);
						closeModal();
					},
					onError: async (error) => {
						// The deploy started but the live stream dropped — verify via health check
						// instead of reporting a failure we don't actually know happened.
						if (error instanceof SSEInconclusiveError) {
							stream.markSettled('inconclusive');
							invalidateComponents();
							const health = await runHealthCheck(project);
							reportDeployHealth(project, health);
							closeModal();
							return;
						}
						stream.markSettled('error', error instanceof Error ? error.message : String(error));
						toast.error(`Failed to redeploy ${project}`, {
							description: error instanceof Error ? error.message : undefined,
						});
					},
				},
			);
		},
		[reDeployApplication, openedEntry, instanceParams, stream, invalidateComponents, runHealthCheck, closeModal],
	);

	const redeployBuffered = useCallback(
		(applicationUrl: string, installCommand: string | undefined) => {
			if (!openedEntry) {
				return;
			}
			closeModal();
			const toastId = toast.loading('Redeploying...');
			reDeployApplication(
				{ applicationName: openedEntry.project, applicationUrl, installCommand, ...instanceParams },
				{
					onSuccess: () => {
						toast.success(`Application ${openedEntry.project} redeployed successfully`, { id: toastId });
						invalidateComponents();
					},
					onError: () => {
						toast.dismiss(toastId);
					},
				},
			);
		},
		[reDeployApplication, openedEntry, instanceParams, invalidateComponents, closeModal],
	);

	const submitForm = ({ applicationUrl, installCommand }: {
		applicationUrl: string | undefined;
		installCommand: string | undefined;
	}) => {
		if (!applicationUrl) {
			return;
		}
		if (sseDeploy) {
			redeployWithProgress(applicationUrl, installCommand);
		} else {
			redeployBuffered(applicationUrl, installCommand);
		}
	};

	return (
		<Dialog
			onOpenChange={closeModal}
			open={isModalOpen}
		>
			<DialogContent aria-describedby={undefined} className="text-popover-foreground">
				<DialogHeader>
					<DialogTitle>Redeploy Package</DialogTitle>
					<DialogDescription>
						{isStreaming ? `Redeploying ${openedEntry?.project ?? 'package'}…` : 'Redeploy this package?'}
					</DialogDescription>
				</DialogHeader>

				{isStreaming
					? (
						<div className="flex flex-col gap-4">
							<DeployProgress state={stream.state} onNavigateAway={closeModal} />
							<Button
								type="button"
								variant="ghostOutline"
								className="w-full"
								onClick={closeModal}
								disabled={isPending}
							>
								{isPending ? 'Deploying…' : 'Close'}
							</Button>
						</div>
					)
					: (
						<div>
							<Form {...methods}>
								<form
									id="instance-redeploy-app-form"
									name="instance-redeploy-app-form"
									className="flex flex-col w-full gap-4"
									onSubmit={handleSubmit(submitForm)}
								>
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
										className="w-full"
										disabled={isPending}
									>
										<RefreshCwIcon /> Redeploy Application
									</Button>
									<Button
										type="button"
										variant="ghostOutline"
										className="w-full"
										onClick={closeModal}
										disabled={isPending}
									>
										Cancel
									</Button>
								</form>
							</Form>
						</div>
					)}
			</DialogContent>
		</Dialog>
	);
}
