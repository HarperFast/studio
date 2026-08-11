import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { isSyntheticAttribute } from '@/features/instance/databases/functions/relationshipAttributes';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { InstanceAttribute, InstanceDatabaseTableMap, InstanceTable } from '@/integrations/api/api.patch';
import { useInsertTableRecords } from '@/integrations/api/instance/database/insertTableRecords';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { WORKER_FREE_JSON_LANGUAGE_ID } from '@/lib/monaco/workerFreeJsonLanguage';
import { pluralize } from '@/lib/pluralize';
import type { EditorProps, OnMount } from '@monaco-editor/react';
import { Save, TerminalIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { describeRecordJsonError, tryParseRecordJson } from './recordEditorJson';
import { useRecordJsonErrorMarker } from './recordJsonErrorMarker';

export function AddTableRowModal({
	isModalOpen,
	instanceTable,
	databaseTables,
	setIsModalOpen,
	refreshTable,
}: {
	instanceTable: InstanceTable;
	databaseTables?: InstanceDatabaseTableMap;
	isModalOpen: boolean;
	setIsModalOpen: (open: boolean) => void;
	refreshTable: () => void;
}) {
	const monacoTheme = useMonacoTheme();
	const { mutate: addTableRecords, isPending: isAddTableRecordsPending } = useInsertTableRecords();
	const instanceParams = useInstanceClientIdParams();

	const [addTableRecordData, setAddTableRecordData] = useState<string>();
	const [madeChanges, setMadeChanges] = useState(false);
	const [skippedHashes, setSkippedHashes] = useState<string[]>([]);
	const { onEditorMount, showRecordJsonError, clearRecordJsonError } = useRecordJsonErrorMarker();

	const sampleJSON = useMemo(() => {
		const sample: Record<string, unknown> = {};
		for (const attribute of instanceTable.attributes) {
			if (
				attribute.is_primary_key || attribute.attribute === '__createdtime__'
				|| attribute.attribute === '__updatedtime__'
				// Relationship/computed attributes are read-only: the server rejects records that
				// assign them, even with null.
				|| isSyntheticAttribute(attribute, databaseTables)
			) {
				continue;
			}
			sample[attribute.attribute] = defaultByAttributeType(attribute.type);
		}
		return JSON.stringify(sample, null, 4);
	}, [instanceTable, databaseTables]);

	const onSubmitClick = useCallback(() => {
		if (addTableRecordData === undefined) {
			return;
		}
		// The only validation the record editors get. Save is deliberately not gated on it: a
		// disabled button explained nothing (#1600), so a bad record is reported here instead — the
		// reason and its location in a toast, plus a marker on the offending line.
		const parsed = tryParseRecordJson(addTableRecordData);
		if (!parsed.ok) {
			toast.error("This record isn't valid JSON", { description: describeRecordJsonError(parsed.error) });
			showRecordJsonError(parsed.error);
			return;
		}
		const records = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
		const toastId = toast.loading(`Adding ${records.length} records...`);
		addTableRecords(
			{
				...instanceParams,
				databaseName: instanceTable.schema,
				tableName: instanceTable.name,
				records,
			},
			{
				onSuccess: (response) => {
					void refreshTable();
					if (!response.skipped_hashes?.length) {
						setIsModalOpen(false);
					}
					setSkippedHashes(response.skipped_hashes);
					(response.skipped_hashes?.length > 0 ? toast.warning : toast.success)(
						response.skipped_hashes?.length > 0 ? 'Warning!' : 'Success!',
						{
							id: toastId,
							description: (
								<>
									{response.inserted_hashes.length > 0
										&& <p>Added {pluralize(response.inserted_hashes.length, 'record', 'records')}</p>}
									{response.skipped_hashes.length > 0
										&& <p>Skipped {pluralize(response.skipped_hashes.length, 'record', 'records')}</p>}
								</>
							),
						},
					);
				},
			},
		);
	}, [
		addTableRecordData,
		addTableRecords,
		instanceParams,
		instanceTable.name,
		instanceTable.schema,
		refreshTable,
		setIsModalOpen,
		showRecordJsonError,
	]);

	const handleEditorDidMount: EditorProps['onMount'] = useCallback<OnMount>((editor, monaco) => {
		onEditorMount(editor, monaco);
		editor?.focus();
	}, [onEditorMount]);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent
				aria-describedby={undefined}
				resizable
				onEscapeKeyDown={(event) => {
					if (madeChanges) {
						event.preventDefault();
					}
				}}
			>
				<DialogHeader>
					<DialogTitle>Add New {instanceTable.name}</DialogTitle>
				</DialogHeader>
				{(instanceTable?.primary_key ?? instanceTable?.hash_attribute)
					&& (
						<div className="text-sm text-gray-500">
							The primary key for this table is{' '}
							<strong>&ldquo;{instanceTable.primary_key ?? instanceTable.hash_attribute}&rdquo;</strong>, and will
							auto-generate. You may manually add it if you want to specify its value.
						</div>
					)}
				{
					/* Wrapper owns the flex sizing: @monaco-editor/react applies `className` to its inner
				    element, not the layout wrapper, so `flex-1 min-h-0` has to live on a div we control
				    for the editor to shrink with the modal. */
				}
				<div className="flex-1 min-h-0 w-full">
					<Editor
						className="w-full h-full"
						// Worker-free JSON: highlighting without a language worker that a large bulk-insert
						// array pasted here could overflow and crash (studio#1370/#1499).
						language={WORKER_FREE_JSON_LANGUAGE_ID}
						theme={monacoTheme}
						value={sampleJSON}
						onChange={(updatedValue) => {
							setAddTableRecordData(updatedValue);
							setMadeChanges(true);
							// The marker from the last failed save described a buffer that no longer exists.
							clearRecordJsonError();
						}}
						options={{ minimap: { enabled: false }, automaticLayout: true }}
						onMount={handleEditorDidMount}
					/>
				</div>
				<div className="text-sm text-gray-500">
					<strong>Provide an [array]</strong> if you want to add more than one record at a time.
				</div>

				{skippedHashes.length > 0 && (
					<Alert className="mt-2">
						<TerminalIcon className="w-4 h-4" />
						<AlertTitle>
							Skipped {skippedHashes.length === 1 ? 'Hash' : 'Hashes'} Detected
						</AlertTitle>
						<AlertDescription className="max-h-36 overflow-auto">
							<ol>
								{skippedHashes.map(hash => <li key={hash}>{hash}</li>)}
							</ol>
						</AlertDescription>
					</Alert>
				)}

				<DialogFooter>
					<div className="flex justify-between w-full">
						<Button
							variant="submit"
							onClick={onSubmitClick}
							accessKey="s"
							// Only "nothing typed yet" disables Save here, which the untouched sample record on
							// screen explains on its own; anything the user has actually edited is submittable,
							// and says why if it can't be inserted.
							disabled={addTableRecordData === undefined || isAddTableRecordsPending}
						>
							<Save />{' '}
							<span>
								<u>S</u>ave Changes
							</span>
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function defaultByAttributeType(type: InstanceAttribute['type']) {
	switch (type) {
		case 'Date':
			return new Date().toISOString();
		case 'Id':
		case 'ID':
		case 'String':
			return '';
		case 'Boolean':
			return false;
		case 'Int':
		case 'Long':
		case 'Float':
		case 'BigInt':
			return 0;
		default:
			return null;
	}
}
