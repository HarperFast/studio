import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Editor from '@monaco-editor/react';
import { Save, Trash } from 'lucide-react';
import { useState } from 'react';

export function EditTableRowModal({
	setIsModalOpen,
	isModalOpen,
	data,
	onSaveChanges,
	onDeleteRecord,
	isUpdateTableRecordsPending,
	isDeleteTableRecordsPending,
}: {
	setIsModalOpen: (open: boolean) => void;
	isModalOpen: boolean;
	data: { id: string | number }[];
	onSaveChanges: (data: Record<string, unknown>[]) => void;
	onDeleteRecord: (data: (string | number)[]) => void;
	isUpdateTableRecordsPending: boolean;
	isDeleteTableRecordsPending: boolean;
}) {
	const [isValidJSON, setIsValidJSON] = useState(true);
	const [updatedTableRecordData, setUpdatedTableRecordData] = useState<string>();

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent
				aria-describedby={undefined}
				onEscapeKeyDown={(event) => {
					event.preventDefault();
				}}
			>
				<DialogHeader>
					<DialogTitle>Edit Row</DialogTitle>
				</DialogHeader>
				{data ? (
					<Editor
						className="w-full h-96"
						language="json"
						theme="vs-dark"
						value={JSON.stringify(data, null, 4)}
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
						<Button
							variant="destructive"
							className="rounded-full"
							onClick={() => {
								onDeleteRecord([data[0]?.id]);
							}}
							disabled={isDeleteTableRecordsPending}
						>
							<Trash /> Delete Row
						</Button>
						<Button
							variant="submit"
							className="rounded-full"
							onClick={() => {
								if (updatedTableRecordData && isValidJSON) {
									onSaveChanges(JSON.parse(updatedTableRecordData));
								}
							}}
							disabled={!isValidJSON || isUpdateTableRecordsPending}
						>
							<Save /> Save Changes
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
