import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { InstanceAttribute, InstanceTable } from '@/integrations/api/api.patch';
import { useInsertTableRecords } from '@/integrations/api/instance/database/insertTableRecords';
import { pluralize } from '@/lib/pluralize';
import Editor from '@monaco-editor/react';
import { Save, TerminalIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function AddTableRowModal({
	isModalOpen,
	instanceTable,
	setIsModalOpen,
	refreshTable,
}: {
	instanceTable: InstanceTable;
	isModalOpen: boolean;
	setIsModalOpen: (open: boolean) => void;
	refreshTable: () => void;
}) {
	const { mutate: addTableRecords, isPending: isAddTableRecordsPending } = useInsertTableRecords();
	const instanceParams = useInstanceClientIdParams();

	const [isValidJSON, setIsValidJSON] = useState(true);
	const [addTableRecordData, setAddTableRecordData] = useState<string>();
	const [madeChanges, setMadeChanges] = useState(false);
	const [skippedHashes, setSkippedHashes] = useState<string[]>([]);

	const sampleJSON = useMemo(() => {
		const sample: Record<string, unknown> = {};
		for (const attribute of instanceTable.attributes) {
			if (
				attribute.is_primary_key || attribute.attribute === '__createdtime__'
				|| attribute.attribute === '__updatedtime__'
			) {
				continue;
			}
			sample[attribute.attribute] = defaultByAttributeType(attribute.type);
		}
		return JSON.stringify(sample, null, 4);
	}, [instanceTable]);

	const onValidate = useCallback((markers: unknown[]) => {
		setMadeChanges(true);
		setIsValidJSON(markers.length === 0);
	}, [setIsValidJSON]);

	const onSubmitClick = useCallback(() => {
		if (addTableRecordData && isValidJSON) {
			const data = JSON.parse(addTableRecordData);
			const records = Array.isArray(data) ? data : [data];
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
		}
	}, [
		addTableRecordData,
		addTableRecords,
		instanceParams,
		instanceTable.name,
		instanceTable.schema,
		isValidJSON,
		refreshTable,
		setIsModalOpen,
	]);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent
				aria-describedby={undefined}
				onEscapeKeyDown={(event) => {
					if (madeChanges) {
						event.preventDefault();
					}
				}}
			>
				<DialogHeader>
					<DialogTitle>Add New {instanceTable.name}</DialogTitle>
				</DialogHeader>
				{instanceTable?.hash_attribute
					&& (
						<div className="text-sm text-gray-500">
							The primary key for this table is{' '}
							<strong>&ldquo;{instanceTable.hash_attribute}&rdquo;</strong>, and will auto-generate. You may manually
							add it if you want to specify its value.
						</div>
					)}
				<Editor
					className="w-full h-96"
					language="json"
					theme="vs-dark"
					value={sampleJSON}
					onValidate={onValidate}
					onChange={setAddTableRecordData}
					options={{ minimap: { enabled: false } }}
				/>
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
							className="rounded-full"
							onClick={onSubmitClick}
							accessKey="s"
							disabled={!addTableRecordData || !isValidJSON || isAddTableRecordsPending}
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
