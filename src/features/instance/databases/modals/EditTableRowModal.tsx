import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { Save, Trash } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export function EditTableRowModal({
	canEditRecords,
	canDeleteRecords,
	setIsModalOpen,
	isModalOpen,
	primaryKey,
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
	data: { __createdtime__?: number; __updatedtime__?: number; [record: string]: unknown }[];
	onSaveChanges: (data: Record<string, unknown>[]) => void;
	onDeleteRecord: (data: unknown[]) => void;
	isUpdateTableRecordsPending: boolean;
	isDeleteTableRecordsPending: boolean;
}) {
	const monacoTheme = useMonacoTheme();
	const [isValidJSON, setIsValidJSON] = useState(true);
	const [madeChanges, setMadeChanges] = useState(false);
	const [updatedTableRecordData, setUpdatedTableRecordData] = useState<string>();

	const value = useMemo(() => {
		const dataWithoutTimes = data?.map(({ __createdtime__, __updatedtime__, ...rowWithoutTime }) => rowWithoutTime);
		return JSON.stringify(dataWithoutTimes, null, 4);
	}, [data]);
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
				autoFocus={canEditRecords}
				onEscapeKeyDown={canEditRecords
					? (event) => {
						if (madeChanges) {
							event.preventDefault();
						}
					}
					: undefined}
			>
				<DialogHeader>
					<DialogTitle>{canEditRecords ? 'Edit' : 'View'} Row</DialogTitle>
				</DialogHeader>
				{data
					? (
						<Editor
							className="w-full flex-1 min-h-0"
							language="json"
							theme={monacoTheme}
							options={{ readOnly: !canEditRecords, automaticLayout: true }}
							value={value}
							onValidate={onValidate}
							onChange={(updatedValue) => {
								setUpdatedTableRecordData(updatedValue);
							}}
						/>
					)
					: <Loading />}
				<DialogFooter>
					<div className="flex justify-between w-full">
						{canDeleteRecords && (
							<Button
								variant="destructive"
								className="rounded-full"
								type="button"
								autoFocus={false}
								onClick={() => {
									const primaryKeyValue = data[0]?.[primaryKey];
									if (primaryKeyValue) {
										onDeleteRecord([primaryKeyValue]);
									}
								}}
								disabled={isDeleteTableRecordsPending}
							>
								<Trash /> Delete Row
							</Button>
						)}
						{canEditRecords && (
							<Button
								variant="submit"
								className="rounded-full"
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
