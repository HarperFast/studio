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
import { useDeploymentRecordAction } from '@/features/instance/applications/hooks/useDeploymentRecordAction';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useSupportsDeploymentSSE } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { useDeployComponentMutation } from '@/integrations/api/instance/applications/deployComponent';
import { deployFailureDetails } from '@/integrations/api/instance/applications/deployOutcome';
import { DeployRolloutError } from '@/integrations/api/instance/applications/restartJob';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { describeError } from '@/react-query/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { deployNotes, reportDeployOutcome, reportDeployResult } from './reportDeployHealth';

export function RedeployApplicationModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowRedeployApplicationModal', false);

	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const sseDeploy = useSupportsDeploymentSSE();
	const stream = useDeploymentStream();
	const runHealthCheck = useComponentHealthCheck(instanceParams);
	const recordAction = useDeploymentRecordAction();

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
					onSuccess: async (result) => {
						const known = result?.rollout?.state !== 'unfollowable';
						stream.markSettled(known ? 'success' : 'inconclusive', undefined, { result });
						invalidateComponents();
						await reportDeployOutcome(project, result, runHealthCheck, {
							action: recordAction(result?.deployment_id),
						});
						// Left open when there is something to read in it: an outcome Studio couldn't confirm, or a warning.
						if (known && !deployNotes(result).warn) {
							closeModal();
						}
					},
					onError: async (error) => {
						// The deploy started but the live stream dropped — verify via health check
						// instead of reporting a failure we don't actually know happened.
						if (error instanceof SSEInconclusiveError) {
							stream.markSettled('inconclusive');
							invalidateComponents();
							await reportDeployOutcome(project, undefined, runHealthCheck);
							closeModal();
							return;
						}
						const action = recordAction(deployFailureDetails(error).deploymentId);
						if (error instanceof DeployRolloutError) {
							// Live on the node that received it; the rollout section names the nodes that did not take it.
							stream.markSettled('error', undefined, { failure: error });
							invalidateComponents();
							toast.error(`${project} did not reach every node`, { description: error.message, action });
							return;
						}
						stream.markSettled('error', error instanceof Error ? error.message : String(error), {
							failure: error,
						});
						toast.error(`Failed to redeploy ${project}`, {
							description: error instanceof Error ? error.message : undefined,
							action,
						});
					},
				},
			);
		},
		[
			reDeployApplication,
			openedEntry,
			instanceParams,
			stream,
			invalidateComponents,
			runHealthCheck,
			closeModal,
			recordAction,
		],
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
					onSuccess: (result) => {
						reportDeployResult(
							openedEntry.project,
							result,
							{ title: `Application ${openedEntry.project} redeployed successfully` },
							{ id: toastId, action: recordAction(result?.deployment_id) },
						);
						invalidateComponents();
					},
					onError: (error) => {
						// The modal is already closed, so a toast is the only place left to link the record from.
						const action = recordAction(deployFailureDetails(error).deploymentId);
						if (error instanceof DeployRolloutError) {
							toast.error(`${openedEntry.project} did not reach every node`, {
								id: toastId,
								description: error.message,
								action,
							});
							invalidateComponents();
							return;
						}
						if (action) {
							toast.error(`Failed to redeploy ${openedEntry.project}`, {
								id: toastId,
								description: describeError(error).message,
								action,
							});
							return;
						}
						toast.dismiss(toastId);
					},
				},
			);
		},
		[reDeployApplication, openedEntry, instanceParams, invalidateComponents, closeModal, recordAction],
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
