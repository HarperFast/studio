import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Loading } from '@/components/Loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import {
	FABRIC_KEEPS_CUSTOMER_MODELS,
	isRecord,
	MODEL_KINDS,
	ModelKind,
	readModelsBlock,
	supportsDecisionModels,
	supportsModels,
	supportsModelsGateway,
	supportsModelsWrite,
} from '@/integrations/api/instance/models/models';
import { getConfigurationQueryOptions } from '@/integrations/api/instance/status/getConfiguration';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { retryUnlessRejected } from '@/react-query/pollUnlessForbidden';
import { describeError } from '@/react-query/queryClient';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ModelDialog, ModelDialogTarget } from './ModelDialog';
import { fabricModelKeys, KIND_LABELS, ModelSummary, storedEntry, summarizeModels } from './modelEntries';
import { ModelsApiCard } from './ModelsApiCard';
import { ModelSaveOutcome } from './saveModelChange';
import { useSaveModelChange } from './useSaveModelChange';

const DOCS_URL = 'https://docs.harperdb.io/reference/v5/models/overview';

function savedMessage(verb: string, model: { kind: ModelKind; name: string }, outcome: ModelSaveOutcome): string {
	const skipped = outcome.notRunning > 0
		? ` ${outcome.notRunning} ${
			outcome.notRunning === 1 ? "instance isn't" : "instances aren't"
		} running and didn't get the change.`
		: '';
	return `${verb} the ${KIND_LABELS[model.kind].one} model '${model.name}'.${skipped}`;
}

/**
 * Keyed by entity: the route keeps its component mounted when the entity changes, and an open
 * dialog's draft must not follow to another one. Design notes: ./DESIGN.md.
 */
export function ConfigAiModelsIndex() {
	const { entityId } = useInstanceClientIdParams();
	return <AiModelsPage key={entityId} />;
}

function AiModelsPage() {
	const { clusterId, instanceId }: { clusterId?: string; instanceId?: string } = useParams({ strict: false });
	const instanceParams = useInstanceClientIdParams();
	const canManage = useInstanceManagePermission();
	const { data: registrationInfo, isError: isVersionError } = useQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const version = registrationInfo?.version;
	const supported = registrationInfo === undefined ? undefined : supportsModels(version);
	const { data: configuration, isError, isFetching, refetch } = useQuery({
		...getConfigurationQueryOptions(instanceParams),
		enabled: canManage && supported === true,
		retry: retryUnlessRejected(),
		meta: { refusalIsAnAnswer: true },
	});
	const { data: cluster, isError: clusterFailed } = useQuery(getClusterInfoQueryOptions(clusterId, false));
	const onRefreshClick = useRefreshClick(refetch);

	// Off Fabric nothing is managed. On Fabric the answer waits for the cluster: until it loads, no
	// entry can be told apart from one of Fabric's, so nothing is offered for change.
	const onFabric = !isLocalStudio && cluster !== undefined && !clusterIsSelfManaged(cluster);
	const placementKnown = isLocalStudio || cluster !== undefined;
	const fabricKeys = useMemo(
		() =>
			onFabric && cluster
				? fabricModelKeys(
					instanceId ? cluster.instances?.filter((instance) => instance.id === instanceId) : cluster.instances,
				)
				: undefined,
		[onFabric, cluster, instanceId],
	);
	const block = useMemo(() => readModelsBlock(configuration), [configuration]);
	const summaries = useMemo(() => summarizeModels(block, fabricKeys), [block, fabricKeys]);

	const [dialog, setDialog] = useState<ModelDialogTarget>();
	const [removeTarget, setRemoveTarget] = useState<ModelSummary>();
	const remove = useSaveModelChange();

	if (!canManage) {
		return <PageNotice>Only super users can view or change AI models.</PageNotice>;
	}
	if (supported === undefined) {
		return isVersionError
			? <PageNotice>This instance's Harper version could not be read, so its AI models are not shown.</PageNotice>
			: <Loading text="Loading..." />;
	}
	if (!supported) {
		return <PageNotice>AI models need Harper 5.1 or later. This instance runs {version}.</PageNotice>;
	}

	const targetNoun = instanceId || isLocalStudio ? 'instance' : 'cluster';
	const kinds = MODEL_KINDS.filter((kind) =>
		kind !== 'decision' || supportsDecisionModels(version) || summaries.decision.length > 0
	);
	const fabricNames = kinds.flatMap((kind) =>
		summaries[kind].filter((model) => model.fabricManaged).map((model) => `${kind}.${model.name}`)
	);
	const writeBlocked = !placementKnown
		? clusterFailed
			? "Studio couldn't read this cluster, so it can't tell which models are Fabric's. Reload to change models here."
			: undefined
		: onFabric && !FABRIC_KEEPS_CUSTOMER_MODELS
		? "Adding your own models isn't available on Fabric yet."
		: !supportsModelsWrite(version)
		? `Adding and changing models here needs Harper 5.4 or later. This ${targetNoun} runs ${version}.`
			+ (onFabric ? '' : " On this version, set them in the models section of the instance's config file.")
		: undefined;
	const canChange = placementKnown && writeBlocked === undefined;
	const busy = isFetching || remove.isPending;

	const onRemoveConfirmed = () => {
		if (!removeTarget) {
			return;
		}
		const { kind, name } = removeTarget;
		remove.mutate(
			{ params: instanceParams, change: { kind, name, loaded: storedEntry(block, kind, name) }, fabricKeys },
			{
				onSuccess: (outcome) => toast.success(savedMessage('Removed', { kind, name }, outcome)),
				onError: (error) => toast.error(describeError(error).message),
				onSettled: () => setRemoveTarget(undefined),
			},
		);
	};

	return (
		<div className="flex flex-col gap-4 px-4 pb-8 md:px-0 md:pr-4">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="max-w-2xl space-y-1">
					<h2 className="text-lg font-semibold">AI Models</h2>
					<p className="text-sm text-muted-foreground">
						The models this {targetNoun}'s apps can call, through <code className="font-mono">models.embed()</code>,
						{' '}
						<code className="font-mono">models.generate()</code> and{' '}
						<code className="font-mono">models.decide()</code>, the <code className="font-mono">@embed</code> and{' '}
						<code className="font-mono">@decide</code> schema directives, and the <code className="font-mono">/v1</code>
						{' '}
						API. An app that names no model uses the one called <code className="font-mono">default</code>.
					</p>
					<a
						className="inline-block text-sm text-muted-foreground underline hover:text-foreground"
						href={DOCS_URL}
						target="_blank"
						rel="noreferrer"
					>
						AI models docs
					</a>
				</div>
				<div className="flex gap-2">
					<Button variant="defaultOutline" onClick={onRefreshClick} disabled={isFetching}>
						<RefreshCwIcon />
						<span className="hidden lg:inline-block">Refresh</span>
					</Button>
					{canChange && (
						<Button disabled={busy} onClick={() => setDialog({ mode: 'add' })}>
							<PlusIcon />
							Add Model
						</Button>
					)}
				</div>
			</div>

			{isError
				? <PageNotice>This {targetNoun}'s settings could not be loaded, so its AI models are not shown.</PageNotice>
				: configuration === undefined
				? <Loading text="Loading..." />
				: (
					<>
						{targetNoun === 'cluster' && (
							<p className="text-sm italic text-muted-foreground">
								You are viewing the models of one instance in your cluster, whichever one answered.
							</p>
						)}
						{onFabric && (
							<PageNotice>
								{fabricNames.length > 0
									? (
										<>
											Fabric provides <NameList names={fabricNames} /> on this instance and manages{' '}
											{fabricNames.length === 1 ? 'it' : 'them'}: Fabric keeps{' '}
											{fabricNames.length === 1 ? 'it' : 'them'} up to date, and{' '}
											{fabricNames.length === 1 ? "it can't" : "they can't"} be edited or removed here.
										</>
									)
									: "Fabric doesn't provide any models on this instance."}
							</PageNotice>
						)}
						{writeBlocked && <PageNotice>{writeBlocked}</PageNotice>}

						{kinds.map((kind) => (
							<section key={kind} className="flex flex-col gap-2" aria-label={KIND_LABELS[kind].title}>
								<div>
									<h3 className="font-semibold">{KIND_LABELS[kind].title}</h3>
									<p className="text-sm text-muted-foreground">{KIND_LABELS[kind].purpose}</p>
								</div>
								{summaries[kind].length === 0
									? <p className="text-sm text-muted-foreground">None set up.</p>
									: (
										<ul className="flex flex-col gap-2">
											{summaries[kind].map((model) => (
												<ModelCard
													key={model.name}
													model={model}
													disabled={busy}
													canChange={canChange}
													onEdit={() => {
														const stored = storedEntry(block, kind, model.name);
														if (isRecord(stored)) {
															setDialog({ mode: 'edit', kind, name: model.name, stored, keyNote: model.keyNote });
														}
													}}
													onRemove={() => setRemoveTarget(model)}
												/>
											))}
										</ul>
									)}
							</section>
						))}

						{supportsModelsGateway(version) && (
							<ModelsApiCard
								instanceParams={instanceParams}
								configuration={configuration}
								targetNoun={targetNoun}
								servesOwnPorts={isLocalStudio || (placementKnown && !onFabric && !!instanceId)}
							/>
						)}
					</>
				)}

			{dialog && (
				<ModelDialog
					target={dialog}
					block={block}
					kinds={kinds}
					instanceParams={instanceParams}
					fabricKeys={fabricKeys}
					onClose={() => setDialog(undefined)}
					onSaved={(outcome, model) => {
						toast.success(savedMessage(dialog.mode === 'edit' ? 'Saved' : 'Added', model, outcome));
						setDialog(undefined);
					}}
				/>
			)}

			<ConfirmDeletionModal
				typeOfThingBeingDeleted={removeTarget
					? `${KIND_LABELS[removeTarget.kind].one} model '${removeTarget.name}'`
					: 'model'}
				isModalOpen={removeTarget !== undefined}
				setIsModalOpen={(open) => !open && !remove.isPending && setRemoveTarget(undefined)}
				deletionConfirmed={onRemoveConfirmed}
				deletionPending={remove.isPending}
				hideDataLossWarning
				transitiveVerb="Remove"
				presentParticiple="Removing"
			/>
		</div>
	);
}

function PageNotice({ children }: { children: ReactNode }) {
	return <p className="rounded-md border p-4 text-sm text-muted-foreground">{children}</p>;
}

function NameList({ names }: { names: string[] }) {
	return (
		<>
			{names.map((name, index) => (
				<span key={name}>
					{index > 0 && (index === names.length - 1 ? ' and ' : ', ')}
					<code className="font-mono">{name}</code>
				</span>
			))}
		</>
	);
}

function ModelCard({ model, disabled, canChange, onEdit, onRemove }: {
	model: ModelSummary;
	disabled: boolean;
	canChange: boolean;
	onEdit: () => void;
	onRemove: () => void;
}) {
	const label = `${KIND_LABELS[model.kind].one} model ${model.name}`;
	return (
		<li className="flex flex-col gap-2 rounded-md border p-4" aria-label={label}>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-mono text-sm font-semibold">{model.name}</span>
					{model.fabricManaged && <Badge variant="secondary">Managed by Fabric</Badge>}
				</div>
				{canChange && !model.fabricManaged && (
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="defaultOutline"
							disabled={disabled || !model.editable}
							title={model.editable
								? undefined
								: "Studio has no form for this backend. Change it in the instance's config file."}
							onClick={onEdit}
						>
							Edit
						</Button>
						<Button size="sm" variant="destructiveOutline" disabled={disabled} onClick={onRemove}>
							Remove
						</Button>
					</div>
				)}
			</div>
			{model.backend === undefined
				? <p className="text-sm text-destructive">This entry has no backend, so Harper can't load it.</p>
				: (
					<dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
						<dt className="text-muted-foreground">Backend</dt>
						<dd className="break-all font-mono text-xs">{model.backend}</dd>
						{model.model !== undefined && (
							<>
								<dt className="text-muted-foreground">Model</dt>
								<dd className="break-all font-mono text-xs">{model.model}</dd>
							</>
						)}
						{model.details.map((detail) => <DetailRow key={detail.label} label={detail.label} value={detail.value} />)}
						{model.fallback.length > 0 && <DetailRow label="Falls back to" value={model.fallback.join(', ')} />}
						{model.keyNote && <DetailRow label="API key" value={model.keyNote} />}
					</dl>
				)}
		</li>
	);
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<>
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="break-all font-mono text-xs">{value}</dd>
		</>
	);
}
