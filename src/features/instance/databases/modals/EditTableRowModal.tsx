import { Loading } from '@/components/Loading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { primaryKeyMismatch } from '@/features/instance/databases/functions/primaryKeyMismatch';
import {
	removedAttributeNames,
	removedRecordAttributes,
} from '@/features/instance/databases/functions/removedRecordAttributes';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { WORKER_FREE_JSON_LANGUAGE_ID } from '@/lib/monaco/workerFreeJsonLanguage';
import { Save, Trash, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { describeRecordJsonError, tryParseRecordJson } from './recordEditorJson';
import { useRecordJsonErrorMarker } from './recordJsonErrorMarker';

export function EditTableRowModal({
	canEditRecords,
	canDeleteRecords,
	canReplaceRecords,
	replaceBlockedReason,
	setIsModalOpen,
	isModalOpen,
	primaryKey,
	missingPrimaryKey,
	recordUnavailable,
	syntheticAttributes,
	data,
	onSaveChanges,
	onReplaceRecord,
	onDeleteRecord,
	isUpdateTableRecordsPending,
	isDeleteTableRecordsPending,
}: {
	canEditRecords: boolean;
	canDeleteRecords: boolean;
	/** Whether this instance and this user can `put`, which is the only way to remove an attribute:
	 * `update` merges, so an attribute left out of the payload keeps its stored value. Added in Harper
	 * 5.3.0 (HarperFast/harper#2347), and it needs both insert and update on the table. */
	canReplaceRecords: boolean;
	/** Why a removal can't be saved, when `canReplaceRecords` is false — the two cases need different
	 * advice, and telling a permission-blocked user to upgrade their instance sends them nowhere. */
	replaceBlockedReason?: 'version' | 'permission';
	setIsModalOpen: (open: boolean) => void;
	isModalOpen: boolean;
	primaryKey: string;
	/** The clicked row has no value for the declared primary key, so it can't be looked up, edited,
	 * or deleted by id (see #1199). We still show its contents read-only, with an explanation. */
	missingPrimaryKey?: boolean;
	/** The row has a primary-key value, but looking it up returned no record — nothing is stored
	 * under that key (the table isn't actually keyed by the declared primary key; see #1199). Shown
	 * read-only with an explanation, since it can't be edited or deleted by that key. */
	recordUnavailable?: boolean;
	/** Relationship/computed attribute names — read-only, so they are hidden from the editable JSON
	 * (saving a record that assigns one fails, even with null). */
	syntheticAttributes?: string[];
	/** Undefined while the record fetch is in flight (the parent passes `searchByIdData?.data`), so
	 * every read must tolerate it — the editor renders a loading state and the write actions guard it. */
	data?: { __createdtime__?: number; __updatedtime__?: number; [record: string]: unknown }[];
	onSaveChanges: (data: Record<string, unknown>[]) => void;
	/** Replace the record wholesale via `put`, which is what removing an attribute requires. One
	 * atomic write: the record is never absent, and `__createdtime__` survives. */
	onReplaceRecord: (data: Record<string, unknown>[]) => void;
	onDeleteRecord: (data: unknown[]) => void;
	isUpdateTableRecordsPending: boolean;
	isDeleteTableRecordsPending: boolean;
}) {
	const monacoTheme = useMonacoTheme();
	// A row that can't be addressed by its declared primary key can't be saved or deleted
	// individually, so force the editor read-only and hide the write actions regardless of the
	// user's permissions.
	const unaddressable = Boolean(missingPrimaryKey) || Boolean(recordUnavailable);
	const isReadOnly = !canEditRecords || unaddressable;
	const [madeChanges, setMadeChanges] = useState(false);
	const [updatedTableRecordData, setUpdatedTableRecordData] = useState<string>();
	const { onEditorMount, showRecordJsonError, clearRecordJsonError } = useRecordJsonErrorMarker();

	// The record as the editor shows it: no `__createdtime__`/`__updatedtime__` (the server owns
	// those) and no read-only synthetic attributes. Save compares against this rather than `data`,
	// so an attribute hidden from the editor can never read as one the user removed.
	const editableRecords = useMemo(
		() =>
			data?.map(({ __createdtime__, __updatedtime__, ...rowWithoutTime }) => {
				for (const synthetic of syntheticAttributes ?? []) {
					delete rowWithoutTime[synthetic];
				}
				return rowWithoutTime;
			}),
		[data, syntheticAttributes],
	);
	const value = useMemo(() => JSON.stringify(editableRecords, null, 4), [editableRecords]);

	// This modal instance is reused across rows (it stays mounted; only `open` toggles), so the
	// draft has to be reset both when a different record is loaded — otherwise a previous row's
	// edit could be saved for the newly opened row — and when the modal is re-opened, since the
	// dialog's contents unmount while it is closed and an abandoned draft would otherwise outlive
	// the editor it was typed in (#1600). Tracking `null` while closed gives both: re-opening the
	// same row is a change of snapshot. Resetting during render (not in an effect) avoids a frame
	// where the stale draft is still live.
	const openRecord = isModalOpen ? value : null;
	const [recordSnapshot, setRecordSnapshot] = useState(openRecord);
	const [discardedUnsavedEdits, setDiscardedUnsavedEdits] = useState(false);
	if (openRecord !== recordSnapshot) {
		// A record that changes under an open editor is a refetch, not a different row (the dialog
		// is modal, so no other row can be clicked): the user's edits are about to be replaced by
		// the stored record, and a Save that silently closed instead of saving was the only sign.
		setDiscardedUnsavedEdits(isModalOpen && recordSnapshot !== null && madeChanges);
		setRecordSnapshot(openRecord);
		setUpdatedTableRecordData(undefined);
		setMadeChanges(false);
	}

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
				{unaddressable && (
					<Alert variant="warning">
						<TriangleAlert />
						<AlertTitle>
							{missingPrimaryKey ? 'This row has no primary key value' : "This row couldn't be loaded"}
						</AlertTitle>
						<AlertDescription>
							<p>
								{missingPrimaryKey
									? (primaryKey
										? (
											<>
												It has no value for the primary key{' '}
												<code>{primaryKey}</code>, so it can't be looked up, edited, or deleted individually.
											</>
										)
										: `It has no primary key value, so it can't be looked up, edited, or deleted individually.`)
									: (primaryKey
										? (
											<>
												Nothing is stored under its primary key{' '}
												<code>{primaryKey}</code>, so it can't be edited or deleted individually.
											</>
										)
										: `Nothing is stored under its primary key, so it can't be edited or deleted individually.`)}
							</p>
							<p>
								This usually means the table's primary key was changed after the row was created, so the value shown
								here isn't the key the record is actually stored under. To remove it, recreate the table or restore the
								original primary key attribute.
							</p>
						</AlertDescription>
					</Alert>
				)}
				{discardedUnsavedEdits && (
					<Alert variant="warning">
						<TriangleAlert />
						<AlertTitle>This record changed while you were editing it</AlertTitle>
						<AlertDescription>
							The editor was refreshed with the stored record, so the unsaved changes were discarded. Make them again
							and save.
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
								// Worker-free JSON: highlighting without a language worker that an oversized
								// record could overflow and crash (studio#1370/#1499).
								language={WORKER_FREE_JSON_LANGUAGE_ID}
								theme={monacoTheme}
								options={{ readOnly: isReadOnly, automaticLayout: true }}
								value={value}
								onMount={onEditorMount}
								onChange={(updatedValue) => {
									setUpdatedTableRecordData(updatedValue);
									setMadeChanges(true);
									setDiscardedUnsavedEdits(false);
									// The marker from the last failed save described a buffer that no longer exists.
									clearRecordJsonError();
								}}
							/>
						</div>
					)
					: <Loading />}
				<DialogFooter>
					<div className="flex justify-between w-full">
						{canDeleteRecords && !unaddressable && (
							<Button
								variant="destructive"
								type="button"
								autoFocus={false}
								onClick={() => {
									const primaryKeyValue = data?.[0]?.[primaryKey];
									if (primaryKeyValue != null) {
										onDeleteRecord([primaryKeyValue]);
									}
								}}
								// Cross-disabled against a save in flight (the parent folds `put` into that prop): a
								// delete that landed while a `put` was still going would be undone by the replace
								// re-creating the record.
								disabled={isDeleteTableRecordsPending || isUpdateTableRecordsPending}
							>
								<Trash /> Delete Row
							</Button>
						)}
						{canEditRecords && !unaddressable && (
							<Button
								variant="submit"
								autoFocus={true}
								accessKey="s"
								onClick={() => {
									// Undefined means the editor was never touched (or the draft was reset because
									// the stored record changed), so there is nothing of the user's to save. An
									// *emptied* editor is a real edit, and falls through to the parse below, which
									// says why it can't be saved.
									if (updatedTableRecordData === undefined) {
										setIsModalOpen(false);
										return;
									}
									// The only validation the record editors get. Save is deliberately not gated on
									// it: a disabled button explained nothing and could outlive the edit that
									// disabled it (#1600), so a bad record is reported here instead — the reason and
									// its location in a toast, plus a marker on the offending line.
									const parsed = tryParseRecordJson(updatedTableRecordData);
									if (!parsed.ok) {
										toast.error("This record isn't valid JSON", {
											description: describeRecordJsonError(parsed.error),
										});
										showRecordJsonError(parsed.error);
										return;
									}
									// The editor opens on an array of one, but an edit that drops the brackets still
									// means that record — `update` only takes a list, so send one either way.
									const records = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
									// Checked before the routing below: a key edit is not an attribute removal, so nothing
									// downstream would notice it. See `primaryKeyMismatch`.
									const mismatch = primaryKeyMismatch(editableRecords, records, primaryKey);
									if (mismatch) {
										toast.error(
											mismatch.kind === 'lost'
												? `This record's ${primaryKey} is missing from the save`
												: mismatch.kind === 'unknown'
												? `This edit names a ${primaryKey} the editor didn't load`
												: `This edit ${mismatch.added ? 'adds' : 'drops'} ${
													(mismatch.added || mismatch.dropped) === 1
														? 'a record'
														: `${mismatch.added || mismatch.dropped} records`
												} with no ${primaryKey}`,
											{
												description: mismatch.kind === 'lost'
													? `${primaryKey} identifies the record, so restore ${
														mismatch.keys.join(', ')
													} to save this edit. Changing it doesn't rename a record — the save would do nothing, or overwrite whatever is stored under the new value. To delete the record, use Delete Row.`
													: mismatch.kind === 'unknown'
													? `Saving would edit the record stored under ${
														mismatch.keys.join(', ')
													}, which isn't the record open here. Remove it from the JSON and edit that record directly.`
													: mismatch.added
													? `A record with no ${primaryKey} can't be written from here — the save would skip it and still report success. Remove it, and use Add Record to create a record.`
													: `Removing a record from the JSON doesn't delete it, so the save would report success having left it alone. Put it back, and use Delete Row to delete a record.`,
											},
										);
										return;
									}
									// Removals go to `put` (a replace); everything else keeps merging through `update`.
									// See `removedRecordAttributes` for why the split matters.
									const removals = removedRecordAttributes(editableRecords, records, primaryKey);
									if (removals.length) {
										// A replace is last-writer-wins over the whole record, so it is only safe for a
										// record the user is deliberately rewriting. The editor loads one record, but its
										// JSON is free text: a pasted batch where only some records drop an attribute
										// would send the untouched ones through `put` too, clobbering concurrent writes
										// to them. Refuse rather than pick a victim.
										if (removals.length < records.length) {
											toast.error("Removing an attribute can't be combined with other record edits", {
												description:
													'Removing an attribute replaces the whole record, which would overwrite any concurrent change to the other records in this payload. Remove the same attribute from every record here, or put it back and save the value changes on their own — the records loaded together have to be saved together.',
											});
											return;
										}
										if (!canReplaceRecords) {
											const attributes = removedAttributeNames(removals);
											const subject = attributes.length === 1 ? 'an attribute' : 'attributes';
											const removing = `Removing ${attributes.join(', ')}`;
											toast.error(
												replaceBlockedReason === 'permission'
													? `You don't have permission to remove ${subject}`
													: `This Harper version can't remove ${subject}`,
												{
													description: replaceBlockedReason === 'permission'
														? `${removing} rewrites the record through the 'put' operation, which needs both insert and update on this table, and 'put' in the role's allowed operations. Ask an administrator for those grants, or set the value to null instead of removing it.`
														: `${removing} needs the 'put' operation, added in Harper 5.3.0. On this instance the update operation can only merge, so the attribute would silently stay. Upgrade the instance, or set the value to null instead of removing it.`,
												},
											);
											return;
										}
										onReplaceRecord(records);
										return;
									}
									onSaveChanges(records);
								}}
								// Also waits out a delete in flight: this modal offers Delete Row beside Save, and a
								// `put` racing that delete would re-create the record the user just removed.
								disabled={isUpdateTableRecordsPending || isDeleteTableRecordsPending}
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
