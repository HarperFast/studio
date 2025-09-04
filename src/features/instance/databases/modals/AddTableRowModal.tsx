import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InstanceAttribute, InstanceTable } from '@/lib/api.patch';
import Editor from '@monaco-editor/react';
import { Save } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export function AddTableRowModal({
	isAddTableRecordsPending,
	isModalOpen,
	onSaveChanges,
	instanceTable,
	setIsModalOpen,
}: {
	isAddTableRecordsPending: boolean;
	isModalOpen: boolean;
	onSaveChanges: (data: Record<string, unknown>[] | Record<string, unknown>) => void;
	instanceTable: InstanceTable;
	setIsModalOpen: (open: boolean) => void;
}) {
	const [isValidJSON, setIsValidJSON] = useState(true);
	const [addTableRecordData, setAddTableRecordData] = useState<string>();
	const onSubmitClick = useCallback(() => {
		if (addTableRecordData && isValidJSON) {
			onSaveChanges(JSON.parse(addTableRecordData));
		}
	}, [addTableRecordData, onSaveChanges, isValidJSON]);
	const [madeChanges, setMadeChanges] = useState(false);
	const onValidate = useCallback((markers: unknown[]) => {
		setMadeChanges(true);
		setIsValidJSON(markers.length === 0);
	}, [setIsValidJSON]);
	const sampleJSON = useMemo(() => {
		const sample: Record<string, unknown> = {};
		for (const attribute of instanceTable.attributes) {
			if (attribute.is_primary_key || attribute.attribute === '__createdtime__' || attribute.attribute === '__updatedtime__') {
				continue;
			}
			sample[attribute.attribute] = defaultByAttributeType(attribute.type);
		}
		return JSON.stringify(sample, null, 4);
	}, [instanceTable]);

	return <Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
		{/* NOTE - Is this okay to do for the aria describedby? */}
		<DialogContent aria-describedby={undefined} onEscapeKeyDown={(event) => {
			if (madeChanges) {
				event.preventDefault();
			}
		}}>
			<DialogHeader>
				<DialogTitle>Add New {instanceTable.name}</DialogTitle>
			</DialogHeader>
			{instanceTable?.hash_attribute &&
							<div className="text-sm text-gray-500">
								The hash_attribute for this table is <strong>&ldquo;{instanceTable.hash_attribute}&rdquo;</strong>, and will
								auto-generate. You may manually add it if you want to specify its value.</div>}
			<Editor className="w-full h-96" language="json" theme="vs-dark"
				value={sampleJSON}
				onValidate={onValidate}
				onChange={(updatedValue) => {
					setAddTableRecordData(updatedValue);
				}} />
			<div className="text-sm text-gray-500">
				<strong>You may paste in an array</strong> if you want to add more than one record at a time.
			</div>
			<DialogFooter>
				<div className="flex justify-between w-full">
					<Button
						variant="submit"
						className="rounded-full"
						onClick={onSubmitClick}
						accessKey="s"
						disabled={!isValidJSON || isAddTableRecordsPending}>
						<Save /> <span><u>S</u>ave Changes</span>
					</Button>
				</div>
			</DialogFooter>
		</DialogContent>
	</Dialog>;
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
