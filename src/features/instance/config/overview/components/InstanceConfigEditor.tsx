import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useRollingConfigUpdate } from '@/hooks/useRollingConfigUpdate';
import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { getConfigurationQueryOptions } from '@/integrations/api/instance/status/getConfiguration';
import { describeError } from '@/react-query/queryClient';
import { useQuery } from '@tanstack/react-query';
import { AlertCircleIcon, LockIcon, SaveIcon, Undo2Icon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	type ConfigObject,
	findRefusedChanges,
	isPlainObject,
	listConfigChanges,
	rebaseDraft,
	setIn,
	toSetConfigurationParams,
} from '../configDraft';
import { omitRestrictedFields } from '../configRestrictions';
import { buildConfigSections } from '../configSchemaFields';
import {
	describeFabricDefault,
	describeFabricSetSetting,
	type FabricContext,
	fabricDefaultSettings,
	fabricSetSettings,
} from '../fabricManagedConfig';
import { configRootSchema } from '../harper-config/harperConfigSchema';
import { describeStudioAccessWarnings } from '../studioAccessWarning';
import { ConfigForm } from './ConfigForm';
import { ConfigReviewDialog } from './ConfigReviewDialog';
import { type ConfigEditorMarker, RawConfigEditor } from './RawConfigEditor';

const SECTIONS = buildConfigSections(configRootSchema);

type Mode = 'form' | 'json';

function toJson(config: ConfigObject) {
	return JSON.stringify(config, null, 4);
}

function parseConfigJson(
	text: string,
): { config: ConfigObject; error?: undefined } | { config?: undefined; error: string } {
	try {
		const parsed: unknown = JSON.parse(text);
		return isPlainObject(parsed) ? { config: parsed } : { error: 'The config must be a JSON object.' };
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

interface InstanceConfigEditorProps {
	targetNoun: 'Instance' | 'Cluster';
	/** The cluster, once loaded; undefined in Local Studio. */
	clusterInfo?: Cluster;
	version?: string;
	/** A cluster's config is read from whichever instance the load balancer picked. */
	readsOneInstanceOfMany: boolean;
}

export function InstanceConfigEditor(
	{ targetNoun, clusterInfo, version, readsOneInstanceOfMany }: InstanceConfigEditorProps,
) {
	const instanceParams = useInstanceClientIdParams();
	const { data: configurationInfo, isLoading, error: loadError } = useQuery(
		getConfigurationQueryOptions(instanceParams),
	);
	const baseline = useMemo(
		() => (configurationInfo ? (omitRestrictedFields(configurationInfo) as ConfigObject) : null),
		[configurationInfo],
	);
	const context = useMemo<FabricContext>(
		// Until the cluster loads it is taken as hosted, so nothing Fabric sets is offered for a moment.
		() => ({ hosted: !isLocalStudio && !clusterIsSelfManaged(clusterInfo), version }),
		[clusterInfo, version],
	);

	const [mode, setMode] = useState<Mode>('form');
	const [base, setBase] = useState<ConfigObject | null>(null);
	const [draft, setDraft] = useState<ConfigObject | null>(null);
	const [jsonText, setJsonText] = useState('');
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [formGeneration, setFormGeneration] = useState(0);
	const [reviewing, setReviewing] = useState(false);
	const [refusal, setRefusal] = useState<string | null>(null);

	// A refetch (after a save, or someone else's) moves the base; the edits are carried over onto it. While the JSON
	// doesn't parse there is no draft to carry, so that waits until it does.
	useEffect(() => {
		if (!baseline || baseline === base || jsonError) {
			return;
		}
		const next = base && draft ? rebaseDraft(base, draft, baseline) : baseline;
		setBase(baseline);
		setDraft(next);
		setJsonText(current => {
			const parsed = parseConfigJson(current);
			return parsed.config && listConfigChanges(parsed.config, next).length === 0 ? current : toJson(next);
		});
	}, [baseline, base, draft, jsonError]);

	const { onConfigUpdate, isPending: isSaving } = useRollingConfigUpdate({
		// Any key here may be one Harper's main thread reads only at startup (`operationsApi`, `mcp`, `authentication`).
		restartOperation: 'restart',
		onRefused: setRefusal,
	});

	const changes = useMemo(() => (base && draft ? listConfigChanges(base, draft) : []), [base, draft]);
	const refused = useMemo(() => findRefusedChanges(changes, context), [changes, context]);
	const hasFieldErrors = Object.keys(fieldErrors).length > 0;
	const dirty = changes.length > 0 || jsonError !== null || hasFieldErrors;
	const canReview = changes.length > 0 && !jsonError && !hasFieldErrors && refused.length === 0 && !isSaving;

	const markers = useMemo<ConfigEditorMarker[]>(() => [
		...fabricSetSettings(context).map(setting => ({
			path: setting.path,
			label: '— managed by Fabric',
			message: `**Managed by Fabric.** ${describeFabricSetSetting(setting)}`,
		})),
		...fabricDefaultSettings(context).map(setting => ({
			path: setting.path,
			label: '— Fabric default',
			message: `**Fabric default.** ${describeFabricDefault(setting)}`,
		})),
	], [context]);

	const restartNote = isLocalStudio
		? 'Saving restarts Harper, so it stops answering for a moment.'
		: targetNoun === 'Cluster'
		? 'Saving writes the changes to each instance in the cluster and restarts the instances one at a time.'
		: 'Saving writes the changes to this instance and restarts it.';
	const warnings = useMemo(
		() => (!isLocalStudio && draft ? describeStudioAccessWarnings(draft, changes, window.location.origin) : []),
		[draft, changes],
	);

	const handleFieldChange = useCallback((path: readonly string[], value: unknown) => {
		setDraft(current => (current ? setIn(current, path, value) : current));
		setRefusal(null);
	}, []);

	const handleFieldError = useCallback((path: readonly string[], message: string | undefined) => {
		const key = path.join('.');
		setFieldErrors(current => {
			if (current[key] === message) { return current; }
			const { [key]: _removed, ...rest } = current;
			return message === undefined ? rest : { ...rest, [key]: message };
		});
	}, []);

	const handleJsonChange = useCallback((text: string) => {
		setJsonText(text);
		setRefusal(null);
		const parsed = parseConfigJson(text);
		if (parsed.error !== undefined) {
			setJsonError(parsed.error);
			return;
		}
		setJsonError(null);
		setDraft(parsed.config);
	}, []);

	const handleModeChange = useCallback((next: string) => {
		if (next === 'json') {
			// Kept as typed when it already says the same, so switching back and forth doesn't reformat it.
			setJsonText(current => {
				const parsed = parseConfigJson(current);
				return parsed.config && draft && listConfigChanges(parsed.config, draft).length === 0
					? current
					: toJson(draft ?? {});
			});
		}
		// The form re-reads every field from the draft when it comes back, so a half-typed value's error goes with it.
		setFieldErrors({});
		setMode(next as Mode);
	}, [draft]);

	const handleDiscard = useCallback(() => {
		if (!base) { return; }
		setDraft(base);
		setJsonText(toJson(base));
		setJsonError(null);
		setFieldErrors({});
		setRefusal(null);
		setFormGeneration(generation => generation + 1);
	}, [base]);

	const handleConfirm = useCallback(() => {
		setReviewing(false);
		setRefusal(null);
		onConfigUpdate(toSetConfigurationParams(changes));
	}, [changes, onConfigUpdate]);

	return (
		<Tabs value={mode} onValueChange={handleModeChange} className="flex grow flex-col gap-3">
			<div className="flex flex-none flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 className="font-bold text-sm/6">Instance Config</h3>
					{readsOneInstanceOfMany && (
						<p className="text-muted-foreground italic text-sm">
							You are viewing the config for one instance in your cluster, based on what the load balancer selected for
							you.
						</p>
					)}
					{context.hosted && (
						<p className="text-muted-foreground text-sm">
							<LockIcon aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px]" />
							Fabric sets some settings every time an instance starts. They're marked Managed by Fabric, and Studio
							won't change them.
						</p>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<TabsList className="p-0.5 text-sm dark:bg-gray-800">
						<TabsTrigger
							value="form"
							className="px-3 py-0.5"
							disabled={jsonError !== null}
							title={jsonError ? 'Fix the JSON first' : undefined}
						>
							Form
						</TabsTrigger>
						<TabsTrigger value="json" className="px-3 py-0.5">Advanced JSON</TabsTrigger>
					</TabsList>
					{dirty && (
						<Button type="button" size="sm" variant="ghost" onClick={handleDiscard} disabled={isSaving}>
							<Undo2Icon className="w-4 h-4 mr-1" /> Discard
						</Button>
					)}
					<Button size="sm" disabled={!canReview} onClick={() => setReviewing(true)}>
						<SaveIcon className="w-4 h-4 mr-1" />
						{isSaving ? 'Saving...' : changes.length > 0 ? `Review & Save (${changes.length})` : 'Review & Save'}
					</Button>
				</div>
			</div>

			{refusal && (
				<Alert variant="destructive">
					<AlertCircleIcon className="h-4 w-4" />
					<AlertTitle>Harper refused the change</AlertTitle>
					<AlertDescription>{refusal}</AlertDescription>
				</Alert>
			)}

			{jsonError && (
				<Alert variant="destructive">
					<AlertCircleIcon className="h-4 w-4" />
					<AlertTitle>Invalid JSON</AlertTitle>
					<AlertDescription>{jsonError}</AlertDescription>
				</Alert>
			)}

			{refused.length > 0 && (
				<Alert variant="destructive">
					<AlertCircleIcon className="h-4 w-4" />
					<AlertTitle>These changes can't be saved</AlertTitle>
					<AlertDescription>
						<ul className="list-disc ml-4 mt-2 space-y-1">
							{refused.map(change => (
								<li key={change.path.join('.')}>
									<code>{change.path.join('.')}</code>: {change.message}
								</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}

			{loadError && !configurationInfo && (
				<Alert variant="destructive">
					<AlertCircleIcon className="h-4 w-4" />
					<AlertTitle>Couldn't load the config</AlertTitle>
					<AlertDescription>{describeError(loadError).message}</AlertDescription>
				</Alert>
			)}

			{isLoading || !base || !draft
				? (
					!loadError && (
						<div>
							<TextLoadingSkeleton className="w-full" />
							<TextLoadingSkeleton className="w-full" />
							<TextLoadingSkeleton className="w-1/2" />
						</div>
					)
				)
				: (
					<>
						<TabsContent value="form" className="grow">
							<ConfigForm
								sections={SECTIONS}
								generation={formGeneration}
								base={base}
								draft={draft}
								context={context}
								disabled={isSaving}
								errors={fieldErrors}
								onChange={handleFieldChange}
								onError={handleFieldError}
							/>
						</TabsContent>
						<TabsContent value="json" className="grow">
							<RawConfigEditor value={jsonText} onChange={handleJsonChange} markers={markers} readOnly={isSaving} />
						</TabsContent>
					</>
				)}

			<ConfigReviewDialog
				open={reviewing}
				onOpenChange={setReviewing}
				changes={changes}
				restartNote={restartNote}
				warnings={warnings}
				saving={isSaving}
				onConfirm={handleConfirm}
			/>
		</Tabs>
	);
}
