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
import { addCommasToNumbers } from '@/lib/addCommasToNumbers';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { WORKER_FREE_JSON_LANGUAGE_ID } from '@/lib/monaco/workerFreeJsonLanguage';
import { ChevronLeftIcon, ChevronRightIcon, Save, Trash, TriangleAlert } from 'lucide-react';
import { type KeyboardEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { describeRecordJsonError, tryParseRecordJson } from './recordEditorJson';
import { useRecordJsonErrorMarker } from './recordJsonErrorMarker';

/** Where the open record sits in the browse result set, and how to step through it. */
export interface RecordNavigation {
	/** 1-based position in the result set. Undefined while the neighbouring page it stepped onto is
	 * still loading, so the label has nothing truthful to show yet. */
	position?: number;
	/** How many records the position counts within. Undefined when that isn't known — a filtered
	 * list is only ever counted by the whole table's count, and "of 40,000" under a filter is a lie. */
	total?: number;
	/** The total is the server's estimate rather than a counted value, so it is shown as "~N". */
	isTotalEstimated?: boolean;
	hasPrevious: boolean;
	hasNext: boolean;
	onPrevious: () => void;
	onNext: () => void;
}

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
	recordNavigation,
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
	/** Where this record sits in the browse result set, and how to step to its neighbours. Omitted
	 * by a caller that doesn't have a result set to step through, which hides the nav entirely. */
	recordNavigation?: RecordNavigation;
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
	const editorContainerRef = useRef<HTMLDivElement>(null);
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
	const value = useMemo(() => editableRecords && JSON.stringify(editableRecords, null, 4), [editableRecords]);
	const editorValue = value ?? '';
	// A value this component hands the editor comes back through `onChange` when the editor is
	// read-only (`setValue` fires the change; the writable path suppresses it), and it arrives at
	// the PREVIOUS render's handler, because @monaco-editor/react refreshes its change subscription
	// in an effect declared after the one that pushes the value. So the echo can't be recognised
	// from props — it is recognised by arming this ref in a layout effect before Monaco pushes the
	// value, then disarming it on the first change that matches. Matching on the text alone would be wrong:
	// a user who undoes an edit back to the stored record types that same text deliberately.
	const renderedValueRef = useRef(editorValue);
	const pushedValueRef = useRef<string | null>(null);
	useLayoutEffect(() => {
		if (renderedValueRef.current !== editorValue) {
			renderedValueRef.current = editorValue;
			pushedValueRef.current = editorValue;
		}
	}, [editorValue]);

	// This modal instance is reused across rows (it stays mounted; only `open` toggles), so the
	// draft has to be reset both when a different record is loaded — otherwise a previous row's
	// edit could be saved for the newly opened row — and when the modal is re-opened, since the
	// dialog's contents unmount while it is closed and an abandoned draft would otherwise outlive
	// the editor it was typed in (#1600). Tracking `null` while closed gives both: re-opening the
	// same row is a change of snapshot. Resetting during render (not in an effect) avoids a frame
	// where the stale draft is still live.
	// Which record is open, independent of its contents. The editor can now be pointed at a
	// different record without closing (the footer's record nav), so a change of contents is only a
	// refetch of the same record when the keys still match.
	const recordIdentity = useMemo(
		() => data && JSON.stringify(data.map((record) => record[primaryKey] ?? null)),
		[data, primaryKey],
	);
	const openRecord = isModalOpen ? value : null;
	const openIdentity = isModalOpen ? recordIdentity : null;
	const [recordSnapshot, setRecordSnapshot] = useState(openRecord);
	const [identitySnapshot, setIdentitySnapshot] = useState(openIdentity);
	const [discardedUnsavedEdits, setDiscardedUnsavedEdits] = useState(false);
	// Whether this open dialog has had a record in it yet, which is what the loading logo is for.
	// Stepping to another record leaves `data` undefined until it arrives, and swapping the editor
	// out for the logo each time made the whole dialog flash — so from the second record on, the
	// editor stays mounted and simply empties. Unsticks when the dialog closes.
	const [hasShownARecord, setHasShownARecord] = useState(false);
	if (openRecord !== recordSnapshot) {
		// The stored record changing under an open editor takes the user's edits with it, and a Save
		// that silently closed instead of saving was the only sign. Only warn when it really is that:
		// the same record, with different contents. Stepping to another record discards nothing that
		// belonged to it, and the draft is dropped by `stepToRecord` before it gets here.
		const isSameRecord = openIdentity != null && openIdentity === identitySnapshot;
		setDiscardedUnsavedEdits(isModalOpen && isSameRecord && madeChanges);
		setRecordSnapshot(openRecord);
		setIdentitySnapshot(openIdentity);
		setUpdatedTableRecordData(undefined);
		setMadeChanges(false);
	}
	// Sticky for as long as the dialog stays open, and independent of the snapshot above: a dialog
	// that opens straight onto a cached record never changes snapshot, but it has still shown one.
	const showsARecord = isModalOpen && (data !== undefined || hasShownARecord);
	if (hasShownARecord !== showsARecord) {
		setHasShownARecord(showsARecord);
	}

	const isWritePending = isUpdateTableRecordsPending || isDeleteTableRecordsPending;

	// Stepping to another record replaces what the editor is showing, so an unsaved draft has to be
	// dealt with first (Escape is blocked for the same reason). Dropping the draft here rather than
	// leaving it for the reset above also keeps that reset's warning meaning what it says: the
	// stored record moved, not the user stepping away from it.
	const stepToRecord = (step: () => void) => {
		if (madeChanges && !confirm('Discard your unsaved changes to this record?')) {
			return;
		}
		setUpdatedTableRecordData(undefined);
		setMadeChanges(false);
		setDiscardedUnsavedEdits(false);
		step();
	};
	const onNavigationKeyDown = (event: KeyboardEvent) => {
		if (
			!recordNavigation
			|| isWritePending
			|| editorContainerRef.current?.contains(event.target as Node)
		) {
			return;
		}
		const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
			? (recordNavigation.hasPrevious ? recordNavigation.onPrevious : undefined)
			: event.key === 'ArrowRight' || event.key === 'ArrowDown'
			? (recordNavigation.hasNext ? recordNavigation.onNext : undefined)
			: undefined;
		if (!step) {
			return;
		}
		event.preventDefault();
		stepToRecord(step);
	};

	return (
		<Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
			{/* NOTE - Is this okay to do for the aria describedby? */}
			<DialogContent
				aria-describedby={undefined}
				resizable
				autoFocus={!isReadOnly}
				onKeyDown={onNavigationKeyDown}
				onEscapeKeyDown={!isReadOnly
					? (event) => {
						if (madeChanges) {
							event.preventDefault();
						}
					}
					: undefined}
			>
				<DialogHeader>
					<DialogTitle>{isReadOnly ? 'View' : 'Edit'} Record</DialogTitle>
				</DialogHeader>
				{unaddressable && (
					<Alert variant="warning">
						<TriangleAlert />
						<AlertTitle>
							{missingPrimaryKey ? 'This record has no primary key value' : "This record couldn't be loaded"}
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
								This usually means the table's primary key was changed after the record was created, so the value shown
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
				{data || hasShownARecord
					? (
						// Wrapper owns the flex sizing: @monaco-editor/react applies `className` to its inner
						// element, not the layout wrapper, so `flex-1 min-h-0` has to live on a div we control
						// for the editor to shrink with the modal.
						<div ref={editorContainerRef} className="flex-1 min-h-0 w-full">
							<Editor
								className="w-full h-full"
								// Worker-free JSON: highlighting without a language worker that an oversized
								// record could overflow and crash (studio#1370/#1499).
								language={WORKER_FREE_JSON_LANGUAGE_ID}
								theme={monacoTheme}
								// Read-only while the next record loads too: there is no record to edit yet, and
								// anything typed would be overwritten the moment it arrives.
								options={{ readOnly: isReadOnly || !data, automaticLayout: true }}
								value={editorValue}
								onMount={onEditorMount}
								onChange={(updatedValue) => {
									// The editor reporting back the value this component just pushed into it is not an
									// edit (see `pushedValueRef`). Every other change is the user's, including one that
									// restores the stored record exactly -- an undone edit is still an edit, and the text
									// on screen is what Save must write.
									const isEchoOfOurOwnPush = pushedValueRef.current !== null && updatedValue === pushedValueRef.current;
									pushedValueRef.current = null;
									if (isEchoOfOurOwnPush) {
										return;
									}
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
					{
						/* Three slots, so the record nav stays centred whichever actions the user's
					    permissions leave on either side of it. */
					}
					<div className="flex items-center justify-between gap-3 w-full">
						<div className="flex">
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
									<Trash /> Delete Record
								</Button>
							)}
						</div>
						{recordNavigation && (
							<RecordNavigationControls
								{...recordNavigation}
								disabled={isWritePending}
								onPrevious={() => stepToRecord(recordNavigation.onPrevious)}
								onNext={() => stepToRecord(recordNavigation.onNext)}
							/>
						)}
						<div className="flex">
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
														} to save this edit. Changing it doesn't rename a record — the save would do nothing, or overwrite whatever is stored under the new value. To delete the record, use Delete Record.`
														: mismatch.kind === 'unknown'
														? `Saving would edit the record stored under ${
															mismatch.keys.join(', ')
														}, which isn't the record open here. Remove it from the JSON and edit that record directly.`
														: mismatch.added
														? `A record with no ${primaryKey} can't be written from here — the save would skip it and still report success. Remove it, and use Add Record to create a record.`
														: `Removing a record from the JSON doesn't delete it, so the save would report success having left it alone. Put it back, and use Delete Record to delete a record.`,
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
									// Also waits out a delete in flight: this modal offers Delete Record beside Save, and a
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
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function RecordNavigationControls(
	{ position, total, isTotalEstimated, hasPrevious, hasNext, onPrevious, onNext, disabled }:
		& RecordNavigation
		& { disabled?: boolean },
) {
	// Echoes the grid's own pager below the table: bordered pill, a chevron either side.
	return (
		<div className="flex items-center rounded-lg border border-border text-sm text-muted-foreground">
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label="Previous record"
				disabled={disabled || !hasPrevious}
				onClick={onPrevious}
			>
				<ChevronLeftIcon />
			</Button>
			<span className="whitespace-nowrap px-1 tabular-nums" aria-live="polite">
				Record {position === undefined ? '…' : addCommasToNumbers(position)}
				{total !== undefined && <>{' of '}{isTotalEstimated ? '~' : ''}{addCommasToNumbers(total)}</>}
			</span>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label="Next record"
				disabled={disabled || !hasNext}
				onClick={onNext}
			>
				<ChevronRightIcon />
			</Button>
		</div>
	);
}
