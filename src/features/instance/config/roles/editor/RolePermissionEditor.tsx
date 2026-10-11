import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getVisualEditorBlockers } from '@/features/instance/config/roles/editor/rolePermissionModel';
import { RoleVisualEditor } from '@/features/instance/config/roles/editor/RoleVisualEditor';
import { RolePermissionDraft } from '@/features/instance/config/roles/editor/useRolePermissionDraft';
import { supportsOperationsAllowlist } from '@/features/instance/config/roles/operations/operationsCatalog';
import { OperationsValueNotice } from '@/features/instance/config/roles/operations/OperationsValueNotice';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { InstanceDatabaseMap, LocalRolePermission } from '@/integrations/api/api.patch';
import { getDescribeAllQueryOptions } from '@/integrations/api/instance/database/getDescribeAll';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { classifyOperationsValue, getOperationsAllowlist } from '@/integrations/api/localRolePermission';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { useQuery } from '@tanstack/react-query';
import { CodeIcon, RefreshCwIcon, Table2Icon } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';

export interface RoleEditorSchema {
	instanceDatabaseMap?: InstanceDatabaseMap;
	version?: string;
	isLoading: boolean;
	isError: boolean;
	retry: () => void;
}

export function useRoleEditorSchema(): RoleEditorSchema {
	const instanceParams = useInstanceClientIdParams();
	// Permission editing only needs the schema tree, never record counts, so this shares the
	// count-free describe_all cache entry the Databases tab populates.
	const describeAll = useQuery(getDescribeAllQueryOptions({ ...instanceParams, skipRecordCount: true }));
	const registrationInfo = useQuery(getRegistrationInfoQueryOptions(instanceParams));
	return {
		instanceDatabaseMap: describeAll.data,
		version: registrationInfo.data?.version,
		isLoading: describeAll.isPending || registrationInfo.isPending,
		// A failed background refetch of data already in hand is not a reason to lose the visual editor.
		isError: (describeAll.isError && !describeAll.data) || (registrationInfo.isError && !registrationInfo.data),
		retry: () => {
			void describeAll.refetch();
			void registrationInfo.refetch();
		},
	};
}

/**
 * Saving past an unusable `operations` value would normalize it away and widen the role, so it has
 * to be repaired in the JSON first. Without a version the allowlist floor is unknown, so anything
 * but a list of names counts as unusable rather than risk dropping one.
 */
export function isOperationsValueUnusable(permission: LocalRolePermission | null, version: string | undefined) {
	if (!permission) {
		return false;
	}
	if (!version) {
		return permission.operations !== undefined && getOperationsAllowlist(permission) === undefined;
	}
	const kind = classifyOperationsValue(permission, supportsOperationsAllowlist(version));
	return kind === 'breaks-auth' || kind === 'malformed';
}

const MAX_LISTED_BLOCKERS = 5;

/**
 * Visual first, JSON as the escape hatch, like the schema editor. Both views edit the same draft
 * text, and the visual one is offered only while that text holds a document it can represent.
 */
export function RolePermissionEditor({
	draft,
	schema,
	readOnly,
}: {
	draft: RolePermissionDraft;
	schema: RoleEditorSchema;
	readOnly?: boolean;
}) {
	const { text, permission } = draft;
	const monacoTheme = useMonacoTheme();
	const { instanceDatabaseMap, version } = schema;
	const schemaReady = !!instanceDatabaseMap && !!version;
	// Undecided until the schema loads; then the view opens on the visual editor when it can.
	const [preferJson, setPreferJson] = useState<boolean>();
	// The JSON view re-checks on every keystroke; deferring keeps typing responsive on a large role.
	const deferredPermission = useDeferredValue(permission);
	const analysed = preferJson === true ? deferredPermission : permission;
	const blockers = useMemo(() => {
		if (!instanceDatabaseMap || !version) {
			return [];
		}
		return analysed
			? getVisualEditorBlockers(analysed, instanceDatabaseMap, version)
			: ['The JSON is not a valid object.'];
	}, [analysed, instanceDatabaseMap, version]);
	const visualAvailable = schemaReady && !!analysed && blockers.length === 0;
	if (preferJson === undefined && schemaReady) {
		setPreferJson(!visualAvailable);
	}

	const operationsKind = permission && version
		? classifyOperationsValue(permission, supportsOperationsAllowlist(version))
		: 'absent';
	const operations = permission?.operations;

	if (schema.isLoading && !schema.isError) {
		return <TextLoadingSkeleton />;
	}

	if (preferJson === false && visualAvailable && permission && instanceDatabaseMap && version) {
		return (
			<div className="flex min-h-0 flex-1 flex-col gap-2">
				<div className="flex justify-end">
					<Button type="button" variant="defaultOutline" size="sm" onClick={() => setPreferJson(true)}>
						<CodeIcon /> Edit as JSON
					</Button>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto pr-1">
					<RoleVisualEditor
						permission={permission}
						onChange={draft.setPermission}
						instanceDatabaseMap={instanceDatabaseMap}
						version={version}
						readOnly={readOnly}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<div className="flex items-start justify-between gap-2">
				<div className="text-xs text-muted-foreground">
					{schema.isError
						? (
							<span className="flex items-center gap-2">
								The visual editor needs this instance's schema and version, which didn't load.
								<Button type="button" variant="defaultOutline" size="sm" onClick={schema.retry}>
									<RefreshCwIcon /> Retry
								</Button>
							</span>
						)
						: blockers.length > 0 && (
							<>
								<p>The visual editor can't show this role until the JSON is fixed:</p>
								<ul className="list-disc pl-4">
									{blockers.slice(0, MAX_LISTED_BLOCKERS).map((blocker) => <li key={blocker}>{blocker}</li>)}
									{blockers.length > MAX_LISTED_BLOCKERS && <li>…and {blockers.length - MAX_LISTED_BLOCKERS} more.</li>}
								</ul>
							</>
						)}
				</div>
				{schemaReady && (
					<Button
						type="button"
						variant="defaultOutline"
						size="sm"
						className="shrink-0"
						disabled={!visualAvailable}
						onClick={() => setPreferJson(false)}
					>
						<Table2Icon /> Visual editor
					</Button>
				)}
			</div>
			{(operationsKind === 'breaks-auth' || operationsKind === 'malformed') && (
				<OperationsValueNotice
					kind={operationsKind}
					// Only a record implies a database of that name, which is the half the remedy has to mention.
					databaseCollision={operations !== null && typeof operations === 'object' && !Array.isArray(operations)}
				/>
			)}
			<div className="min-h-64 flex-1">
				<Editor
					className="h-full w-full"
					theme={monacoTheme}
					defaultLanguage="json"
					value={text}
					options={{ readOnly, automaticLayout: true }}
					onChange={(value) => draft.setText(value ?? '')}
				/>
			</div>
		</div>
	);
}
