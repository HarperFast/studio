import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Editor from '@monaco-editor/react';
import { Save, Trash } from 'lucide-react';
import { useMemo, useState } from 'react';

export function EditTableRowModal({
	canEditRecords,
	canDeleteRecords,
	setIsModalOpen,
	isModalOpen,
	hashAttribute,
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
	hashAttribute: string;
	data: { __createdtime__?: number; __updatedtime__?: number; [record: string]: unknown; }[];
	onSaveChanges: (data: Record<string, unknown>[]) => void;
	onDeleteRecord: (data: unknown[]) => void;
	isUpdateTableRecordsPending: boolean;
	isDeleteTableRecordsPending: boolean;
}) {
	const [isValidJSON, setIsValidJSON] = useState(true);
	const [updatedTableRecordData, setUpdatedTableRecordData] = useState<string>();
	const value = useMemo(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const dataWithoutTimes = data?.map(({ __createdtime__, __updatedtime__, ...rowWithoutTime  }) => rowWithoutTime);
		return JSON.stringify(dataWithoutTimes, null, 4);
	}, [data]);

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent
				aria-describedby={undefined}
				onEscapeKeyDown={canEditRecords ? (event) => {
					event.preventDefault();
				} : undefined}
			>
				<DialogHeader>
					<DialogTitle>{canEditRecords ? 'Edit' : 'View'} Row</DialogTitle>
				</DialogHeader>
				{data ? (
					<Editor
						className="w-full h-96"
						language="json"
						theme="vs-dark"
						options={canEditRecords ? undefined : { readOnly: true }}
						value={value}
						onValidate={(markers) => {
							setIsValidJSON(markers.length === 0);
						}}
						onChange={(updatedValue) => {
							setUpdatedTableRecordData(updatedValue);
						}}
					/>
				) : (
					<Loading />
				)}
				<DialogFooter>
					<div className="flex justify-between w-full">
						{canDeleteRecords && (<Button
							variant="destructive"
							className="rounded-full"
							onClick={() => {
								const hash = data[0]?.[hashAttribute];
								if (hash) {
									onDeleteRecord([hash]);
								}
							}}
							disabled={isDeleteTableRecordsPending}
						>
							<Trash /> Delete Row
						</Button>)}
						{canEditRecords && (<Button
							variant="submit"
							className="rounded-full"
							accessKey="s"
							onClick={() => {
								if (updatedTableRecordData && isValidJSON) {
									onSaveChanges(JSON.parse(updatedTableRecordData));
								}
							}}
							disabled={!isValidJSON || isUpdateTableRecordsPending}
						>
							<Save /> <span><u>S</u>ave Changes</span>
						</Button>)}
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
