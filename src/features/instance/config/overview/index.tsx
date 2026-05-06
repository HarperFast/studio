import { ApplyLicensesButton } from '@/components/ApplyLicensesButton';
import { RestartButton } from '@/components/RestartButton';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getInstanceInfoQueryOptions } from '@/features/cluster/queries/getInstanceInfoQuery';
import { ApplicationURL } from '@/features/instance/config/overview/components/ApplicationURL';
import { ClusterDomainsList } from '@/features/instance/config/overview/components/ClusterDomainsList';
import { HarperVersion } from '@/features/instance/config/overview/components/HarperVersion';
import { InstanceNodeName } from '@/features/instance/config/overview/components/InstanceNodeName';
import { InstanceURL } from '@/features/instance/config/overview/components/InstanceURL';
import { useRollingConfigUpdate } from '@/hooks/useRollingConfigUpdate';
import { getConfigurationQueryOptions } from '@/integrations/api/instance/status/getConfiguration';
import {
	getRegistrationInfoQueryOptions,
	RegistrationInfoResponse,
} from '@/integrations/api/instance/status/getRegistrationInfo';
import { getUsageLicensesQueryOptions } from '@/integrations/api/instance/status/getUsageLicenses';
import { keyBy } from '@/lib/keyBy';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import Editor from '@monaco-editor/react';
import { useQuery } from '@tanstack/react-query';
import { useLoaderData, useParams } from '@tanstack/react-router';
import { AlertCircleIcon, EditIcon, SaveIcon, XIcon } from 'lucide-react';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { flattenConfig, getChangedFields, isRestrictedConfigPath, omitRestrictedFields } from './configRestrictions';

const LocalStudioOverview = ({ children }: { children: ReactNode }) => {
	return <>{children}</>;
};

const CloudStudioOverview = ({ children }: { children: ReactNode }) => {
	return <>{children}</>;
};

export function ConfigOverviewIndex() {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { data: info, isLoading: loadingInstanceInfo } = useQuery(
		getInstanceInfoQueryOptions({ clusterId, instanceId }),
	);
	const targetNoun = (instanceId || isLocalStudio) ? 'Instance' : 'Cluster';
	const instanceParams = useInstanceClientIdParams();

	const { version }: RegistrationInfoResponse = useLoaderData({ strict: false });
	const checkUsageLicenses = !isLocalStudio && wasAReleasedBeforeB('4.7.0-alpha.1', version);

	const { data: appliedLicenses } = useQuery(
		getUsageLicensesQueryOptions(instanceParams, checkUsageLicenses),
	);
	const clusterInfo = info?.cluster;
	const instanceInfo = info?.instance;
	const { data: registrationInfo, isLoading: loadingRegistration } = useQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const { data: configurationInfo, isLoading: loadingConfig } = useQuery(
		getConfigurationQueryOptions(instanceParams),
	);

	const sanitizedConfigInfo = useMemo(() => {
		if (!configurationInfo) { return null; }
		return omitRestrictedFields(configurationInfo);
	}, [configurationInfo]);

	const [isEditing, setIsEditing] = useState(false);
	const [editedConfig, setEditedConfig] = useState<string>('');
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [restrictedError, setRestrictedError] = useState<string[]>([]);

	const { onConfigUpdate, isPending: isSaving } = useRollingConfigUpdate();

	useEffect(() => {
		if (sanitizedConfigInfo && !isEditing) {
			setEditedConfig(JSON.stringify(sanitizedConfigInfo, null, 4));
			setJsonError(null);
			setRestrictedError([]);
		}
	}, [sanitizedConfigInfo, isEditing]);

	const handleEditorChange = useCallback((value: string | undefined) => {
		setEditedConfig(value || '');
		if (value) {
			try {
				const parsed = JSON.parse(value);
				setJsonError(null);

				const blockedFields: string[] = [];
				const checkBlocked = (obj: any, orig: any, path = '') => {
					for (const key in obj) {
						const currentPath = path ? `${path}.${key}` : key;
						const val = obj[key];
						const origVal = orig?.[key];

						if (isRestrictedConfigPath(currentPath, val, origVal)) {
							blockedFields.push(currentPath);
						} else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
							checkBlocked(val, origVal, currentPath);
						}
					}
					// Also check for deleted keys if they were blocked
					for (const key in orig) {
						const currentPath = path ? `${path}.${key}` : key;
						if (!(key in obj)) {
							if (isRestrictedConfigPath(currentPath, undefined, orig[key])) {
								blockedFields.push(currentPath);
							}
						}
					}
				};

				if (sanitizedConfigInfo) {
					checkBlocked(parsed, sanitizedConfigInfo);
				}
				setRestrictedError(blockedFields);
			} catch (e: any) {
				setJsonError(e.message);
				setRestrictedError([]);
			}
		}
	}, [configurationInfo]);

	const handleSave = useCallback(() => {
		if (jsonError || restrictedError.length > 0) { return; }
		try {
			const parsed = JSON.parse(editedConfig);
			const changedFields = getChangedFields(sanitizedConfigInfo, parsed);
			const flattened = flattenConfig(changedFields);

			onConfigUpdate(flattened);
			setIsEditing(false);
		} catch (e: any) {
			setJsonError(e.message);
		}
	}, [editedConfig, jsonError, onConfigUpdate, sanitizedConfigInfo, restrictedError.length]);

	const newLicenses = useMemo(() => {
		if (isLocalStudio) {
			return [];
		}
		const cloudLicenses = instanceInfo?.licenses;
		if (appliedLicenses && cloudLicenses) {
			const appliedLicensesById = keyBy(appliedLicenses, 'id');
			return cloudLicenses.filter(cloudLicense => !appliedLicensesById[cloudLicense.id]);
		}
		return [];
	}, [appliedLicenses, instanceInfo]);

	return (
		<div className="h-full flex flex-col">
			{isLocalStudio
				? (
					<LocalStudioOverview>
						<dl className="grid grid-cols-1 sm:grid-cols-3">
							<div className="px-4 pb-4 sm:col-span-2 sm:px-0">
								<HarperVersion loadingRegistration={loadingRegistration} registrationInfo={registrationInfo} />
							</div>
							<div className="px-4 pb-4 text-right sm:col-span-1 sm:px-0">
								<RestartButton
									targetNoun={targetNoun}
									instanceClient={instanceParams.instanceClient}
									operation="restart"
								/>
							</div>
						</dl>
					</LocalStudioOverview>
				)
				: (
					<CloudStudioOverview>
						<dl className="flex-none grid grid-cols-1 sm:grid-cols-4">
							<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
								<HarperVersion loadingRegistration={loadingRegistration} registrationInfo={registrationInfo} />
							</div>
							<div className="px-4 pb-4 sm:col-span-2 sm:px-0">
								<InstanceURL loadingInstanceInfo={loadingInstanceInfo} instanceInfo={instanceInfo} />
							</div>
							<div className="px-4 pb-4 text-right sm:col-span-1 sm:px-0 grid gap-1">
								{newLicenses?.length > 0 && <ApplyLicensesButton newLicenses={newLicenses} />}
								<RestartButton
									targetNoun={targetNoun}
									instanceClient={instanceParams.instanceClient}
									operation="restart"
								/>
							</div>
							<div className="px-4 pb-4 sm:col-span-1 sm:px-0">
								<InstanceNodeName loadingInstanceInfo={loadingInstanceInfo} instanceInfo={instanceInfo} />
							</div>
							<div className="px-4 pb-4 sm:col-span-2 sm:px-0">
								<ApplicationURL loadingInstanceInfo={loadingInstanceInfo} clusterInfo={clusterInfo} />
							</div>
							{clusterInfo?.domains?.length && (
								<div className="px-4 pb-4 sm:col-span-3 sm:px-0">
									<ClusterDomainsList loadingInstanceInfo={loadingInstanceInfo} clusterInfo={clusterInfo} />
								</div>
							)}
						</dl>
					</CloudStudioOverview>
				)}

			<div className="flex-none flex items-center justify-between mb-2">
				<div>
					<h3 className="font-bold text-sm/6">Instance Config {isEditing ? '(editing)' : '(read only)'}</h3>
					{!instanceId && !isLocalStudio && (
						<p className="text-muted-foreground italic text-sm">
							You are viewing the config for one instance in your cluster, based on what the load balancer selected for
							you.
						</p>
					)}
				</div>
				<div className="flex items-center gap-2 pr-4">
					{!isEditing
						? (
							<Button size="sm" onClick={() => setIsEditing(true)}>
								<EditIcon className="w-4 h-4 mr-1" /> Edit
							</Button>
						)
						: (
							<>
								<Button type="button" size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
									<XIcon className="w-4 h-4 mr-1" /> Cancel
								</Button>
								<Button
									size="sm"
									disabled={!!jsonError || restrictedError.length > 0 || isSaving}
									onClick={handleSave}
								>
									<SaveIcon className="w-4 h-4 mr-1" /> {isSaving ? 'Saving...' : 'Save & Restart'}
								</Button>
							</>
						)}
				</div>
			</div>

			{jsonError && (
				<Alert variant="destructive" className="mb-4">
					<AlertCircleIcon className="h-4 w-4" />
					<AlertTitle>Invalid JSON</AlertTitle>
					<AlertDescription>{jsonError}</AlertDescription>
				</Alert>
			)}

			{restrictedError.length > 0 && (
				<Alert variant="destructive" className="mb-4">
					<AlertCircleIcon className="h-4 w-4" />
					<AlertTitle>Restricted Configuration</AlertTitle>
					<AlertDescription>
						The following fields cannot be modified via Studio:
						<ul className="list-disc ml-4 mt-2">
							{restrictedError.map(field => (
								<li key={field}>
									<code>{field}</code>
								</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}

			<div className="grow">
				{!loadingConfig
					? (
						<Editor
							className="w-full min-h-full h-96"
							language="json"
							theme="vs-dark"
							options={{ readOnly: !isEditing, scrollBeyondLastLine: false }}
							value={isEditing ? editedConfig : JSON.stringify(sanitizedConfigInfo, null, 4)}
							onChange={handleEditorChange}
						/>
					)
					: (
						<>
							<TextLoadingSkeleton className="w-full" />
							<TextLoadingSkeleton className="w-full" />
							<TextLoadingSkeleton className="w-1/2" />
						</>
					)}
			</div>
		</div>
	);
}
