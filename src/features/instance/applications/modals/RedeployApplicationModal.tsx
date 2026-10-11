import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormDescription } from '@/components/ui/form/FormDescription';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { DeployProgress } from '@/features/instance/applications/components/DeployProgress/DeployProgress';
import { useDeploymentStream } from '@/features/instance/applications/components/DeployProgress/useDeploymentStream';
import { useComponentHealthCheck } from '@/features/instance/applications/hooks/useComponentHealthCheck';
import { useDeploymentRecordAction } from '@/features/instance/applications/hooks/useDeploymentRecordAction';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import {
	useStagedDeploymentsAvailable,
	useSupportsDeploymentSSE,
} from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { useDeployComponentMutation } from '@/integrations/api/instance/applications/deployComponent';
import { DeployComponentResult } from '@/integrations/api/instance/applications/deployComponentStream';
import { deployFailureDetails } from '@/integrations/api/instance/applications/deployOutcome';
import { DeployRolloutError } from '@/integrations/api/instance/applications/restartJob';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { attemptToRestoreFocus } from '@/lib/attemptToRestoreFocus';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { describeError } from '@/react-query/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { deployNotes, reportDeployOutcome, reportDeployResult, reportStaged } from './reportDeployHealth';

export function RedeployApplicationModal() {
	const { value: isModalOpen, trigger } = useWatchedValue('ShowRedeployApplicationModal', false);

	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const sseDeploy = useSupportsDeploymentSSE();
	const canStage = useStagedDeploymentsAvailable();
	const stream = useDeploymentStream();
	const runHealthCheck = useComponentHealthCheck(instanceParams);
	const recordAction = useDeploymentRecordAction();

	const { openedEntry } = useEditorView();
	const packageUrl = openedEntry?.package;

	const { mutateAsync: reDeployApplication, isPending } = useDeployComponentMutation();
	const [isStreaming, setIsStreaming] = useState(false);
	// The attempt whose panel is on screen. Set beside the state it mirrors, not from an effect: a
	// deploy can fail before the render that shows the panel commits.
	const deployOnScreen = useRef<symbol>(undefined);
	useEffect(() => () => {
		deployOnScreen.current = undefined;
	}, []);
	const [isStaging, setIsStaging] = useState(false);

	const methods = useForm({
		defaultValues: {
			applicationUrl: packageUrl,
			installCommand: '',
			stageOnly: false,
		},
	});

	const { control, handleSubmit, reset, watch } = methods;
	const stageOnlyChecked = canStage && watch('stageOnly');

	useEffect(() => {
		reset({ applicationUrl: packageUrl, stageOnly: false });
	}, [reset, packageUrl]);

	const closeModal = useCallback(() => {
		setWatchedValue('ShowRedeployApplicationModal', false);
		attemptToRestoreFocus(trigger);
		reset({ applicationUrl: packageUrl, stageOnly: false });
		setIsStreaming(false);
		deployOnScreen.current = undefined;
		setIsStaging(false);
		stream.reset();
	}, [reset, packageUrl, trigger, stream]);

	const invalidateComponents = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: [instanceParams.entityId, 'get_components'],
			refetchType: 'active',
		});
	}, [queryClient, instanceParams.entityId]);

	const redeployWithProgress = useCallback(
		async (applicationUrl: string, installCommand: string | undefined, stage: boolean) => {
			if (!openedEntry) {
				return;
			}
			const project = openedEntry.project;
			const deploy = Symbol(project);
			const isOnScreen = () => deployOnScreen.current === deploy;
			stream.reset();
			stream.markStarted();
			setIsStreaming(true);
			setIsStaging(stage);
			deployOnScreen.current = deploy;

			let result: DeployComponentResult;
			try {
				result = await reDeployApplication({
					request: { kind: stage ? 'stage' : 'deploy', project, package: applicationUrl, installCommand },
					useSSE: true,
					onEvent: stream.onEvent,
					...instanceParams,
				});
			} catch (error) {
				// The deploy started but the live stream dropped — verify via health check
				// instead of reporting a failure we don't actually know happened.
				if (error instanceof SSEInconclusiveError) {
					if (isOnScreen()) {
						stream.markSettled('inconclusive');
					}
					if (stage) {
						// A stage changes nothing that is running, so the component's health says nothing about it.
						toast.warning(`${project} may not be staged`, {
							description: 'Live updates ended before the stage finished. Check Deployments for its record.',
						});
					} else {
						invalidateComponents();
						await reportDeployOutcome(project, undefined, runHealthCheck);
					}
					if (isOnScreen()) {
						closeModal();
					}
					return;
				}
				const rolloutFailed = error instanceof DeployRolloutError;
				if (rolloutFailed) {
					// Live on the node that received it.
					invalidateComponents();
				}
				const { message } = describeError(error);
				if (isOnScreen()) {
					// The rollout section names the nodes a rolled-out release missed.
					stream.markSettled('error', rolloutFailed ? undefined : message, { failure: error });
					return;
				}
				const title = rolloutFailed
					? `${project} did not reach every node`
					: `Failed to ${stage ? 'stage' : 'redeploy'} ${project}`;
				toast.error(title, { description: message, action: recordAction(deployFailureDetails(error).deploymentId) });
				return;
			}
			if (stage) {
				if (isOnScreen()) {
					stream.markSettled('success', undefined, { result });
				}
				reportStaged(project, result, { action: recordAction(result?.deployment_id) });
				if (isOnScreen() && !deployNotes(result).warn) {
					closeModal();
				}
				return;
			}
			const known = result?.rollout?.state !== 'unfollowable';
			if (isOnScreen()) {
				stream.markSettled(known ? 'success' : 'inconclusive', undefined, { result });
			}
			invalidateComponents();
			await reportDeployOutcome(project, result, runHealthCheck, { action: recordAction(result?.deployment_id) });
			// Left open when there is something to read in it: an outcome Studio couldn't confirm, or a warning.
			if (isOnScreen() && known && !deployNotes(result).warn) {
				closeModal();
			}
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
		async (applicationUrl: string, installCommand: string | undefined, stage: boolean) => {
			if (!openedEntry) {
				return;
			}
			const project = openedEntry.project;
			closeModal();
			const toastId = toast.loading(stage ? 'Staging...' : 'Redeploying...');
			let result: DeployComponentResult;
			try {
				result = await reDeployApplication({
					request: { kind: stage ? 'stage' : 'deploy', project, package: applicationUrl, installCommand },
					...instanceParams,
				});
			} catch (error) {
				const action = recordAction(deployFailureDetails(error).deploymentId);
				if (error instanceof DeployRolloutError) {
					toast.error(`${project} did not reach every node`, { id: toastId, description: error.message, action });
					invalidateComponents();
					return;
				}
				toast.error(`Failed to ${stage ? 'stage' : 'redeploy'} ${project}`, {
					id: toastId,
					description: describeError(error).message,
					action,
				});
				return;
			}
			if (stage) {
				reportStaged(project, result, { id: toastId, action: recordAction(result?.deployment_id) });
				return;
			}
			reportDeployResult(
				project,
				result,
				{ title: `Application ${project} redeployed successfully` },
				{ id: toastId, action: recordAction(result?.deployment_id) },
			);
			invalidateComponents();
		},
		[reDeployApplication, openedEntry, instanceParams, invalidateComponents, closeModal, recordAction],
	);

	const submitForm = ({ applicationUrl, installCommand, stageOnly }: {
		applicationUrl: string | undefined;
		installCommand: string | undefined;
		stageOnly?: boolean;
	}) => {
		if (!applicationUrl) {
			return;
		}
		const stage = canStage && !!stageOnly;
		if (sseDeploy) {
			void redeployWithProgress(applicationUrl, installCommand, stage);
		} else {
			void redeployBuffered(applicationUrl, installCommand, stage);
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
						{isStreaming
							? `${isStaging ? 'Staging' : 'Redeploying'} ${openedEntry?.project ?? 'package'}…`
							: 'Redeploy this package?'}
					</DialogDescription>
				</DialogHeader>

				{isStreaming
					? (
						<div className="flex flex-col gap-4">
							<DeployProgress state={stream.state} onNavigateAway={closeModal} staging={isStaging} />
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
									{canStage && (
										<FormField
											control={control}
											name="stageOnly"
											render={({ field }) => (
												<FormItem className="flex flex-row items-start gap-3">
													<FormControl>
														<Switch checked={field.value} onCheckedChange={field.onChange} />
													</FormControl>
													<div className="flex flex-col gap-1">
														<FormLabel>Stage only</FormLabel>
														<FormDescription>
															Install it on every node without making it live. Activate it later from Deployments.
														</FormDescription>
													</div>
												</FormItem>
											)}
										/>
									)}
									<Button
										variant="positiveOutline"
										type="submit"
										className="w-full"
										disabled={isPending}
									>
										<RefreshCwIcon /> {stageOnlyChecked ? 'Stage Application' : 'Redeploy Application'}
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
