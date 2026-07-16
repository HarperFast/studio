import { Loading } from '@/components/Loading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { Save, Trash, TriangleAlert } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export function EditTableRowModal({
	canEditRecords,
	canDeleteRecords,
	setIsModalOpen,
	isModalOpen,
	primaryKey,
	missingPrimaryKey,
	syntheticAttributes,
	data,
	onSaveChanges,
	onDeleteRecord,
	isUpdateTableRecordsPending,
	isDeleteTableRecordsPending,
}: {
	canEditRecords: boolean;
	canDeleteRecords: boolean;
	setIsModalOpen: (open: boolean) => void;
	isModalOpen: boolean;
	primaryKey: string;
	/** The clicked row has no value for the declared primary key, so it can't be looked up, edited,
	 * or deleted by id (see #1199). We still show its contents read-only, with an explanation. */
	missingPrimaryKey?: boolean;
	/** Relationship/computed attribute names — read-only, so they are hidden from the editable JSON
	 * (saving a record that assigns one fails, even with null). */
	syntheticAttributes?: string[];
	data: { __createdtime__?: number; __updatedtime__?: number; [record: string]: unknown }[];
	onSaveChanges: (data: Record<string, unknown>[]) => void;
	onDeleteRecord: (data: unknown[]) => void;
	isUpdateTableRecordsPending: boolean;
	isDeleteTableRecordsPending: boolean;
}) {
	const monacoTheme = useMonacoTheme();
	// Without a usable primary key the record can't be saved or deleted individually, so force the
	// editor read-only and hide the write actions regardless of the user's permissions.
	const isReadOnly = !canEditRecords || Boolean(missingPrimaryKey);
	const [isValidJSON, setIsValidJSON] = useState(true);
	const [madeChanges, setMadeChanges] = useState(false);
	const [updatedTableRecordData, setUpdatedTableRecordData] = useState<string>();

	const value = useMemo(() => {
		const dataWithoutTimes = data?.map(({ __createdtime__, __updatedtime__, ...rowWithoutTime }) => {
			for (const synthetic of syntheticAttributes ?? []) {
				delete rowWithoutTime[synthetic];
			}
			return rowWithoutTime;
		});
		return JSON.stringify(dataWithoutTimes, null, 4);
	}, [data, syntheticAttributes]);
	const onValidate = useCallback((markers: unknown[]) => {
		setMadeChanges(true);
		setIsValidJSON(markers.length === 0);
	}, [setIsValidJSON]);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent
				aria-describedby={undefined}
				resizable
				autoFocus={!isReadOnly}
				onEscapeKeyDown={!isReadOnly
					? (event) => {
						if (madeChanges) {
							event.preventDefault();
						}
					}
					: undefined}
			>
				<DialogHeader>
					<DialogTitle>{isReadOnly ? 'View' : 'Edit'} Row</DialogTitle>
				</DialogHeader>
				{missingPrimaryKey && (
					<Alert variant="warning">
						<TriangleAlert />
						<AlertTitle>This row has no primary key value</AlertTitle>
						<AlertDescription>
							<p>
								{primaryKey
									? (
										<>
											It has no value for the primary key{' '}
											<code>{primaryKey}</code>, so it can't be looked up, edited, or deleted individually.
										</>
									)
									: `It has no primary key value, so it can't be looked up, edited, or deleted individually.`}
							</p>
							<p>
								This usually means the table's primary key was changed after the row was created. To remove it, recreate
								the table or restore the original primary key attribute.
							</p>
						</AlertDescription>
					</Alert>
				)}
				{data
					? (
						// Wrapper owns the flex sizing: @monaco-editor/react applies `className` to its inner
						// element, not the layout wrapper, so `flex-1 min-h-0` has to live on a div we control
						// for the editor to shrink with the modal.
						<div className="flex-1 min-h-0 w-full">
							<Editor
								className="w-full h-full"
								language="json"
								theme={monacoTheme}
								options={{ readOnly: isReadOnly, automaticLayout: true }}
								value={value}
								onValidate={onValidate}
								onChange={(updatedValue) => {
									setUpdatedTableRecordData(updatedValue);
								}}
							/>
						</div>
					)
					: <Loading />}
				<DialogFooter>
					<div className="flex justify-between w-full">
						{canDeleteRecords && !missingPrimaryKey && (
							<Button
								variant="destructive"
								type="button"
								autoFocus={false}
								onClick={() => {
									const primaryKeyValue = data[0]?.[primaryKey];
									if (primaryKeyValue != null) {
										onDeleteRecord([primaryKeyValue]);
									}
								}}
								disabled={isDeleteTableRecordsPending}
							>
								<Trash /> Delete Row
							</Button>
						)}
						{canEditRecords && !missingPrimaryKey && (
							<Button
								variant="submit"
								autoFocus={true}
								accessKey="s"
								onClick={() => {
									if (updatedTableRecordData && isValidJSON) {
										onSaveChanges(JSON.parse(updatedTableRecordData));
									} else {
										setIsModalOpen(false);
									}
								}}
								disabled={!isValidJSON || isUpdateTableRecordsPending}
							>
								<Save />{' '}
								<span>
									<u>S</u>ave Changes
								</span>
							</Button>
						)}
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
