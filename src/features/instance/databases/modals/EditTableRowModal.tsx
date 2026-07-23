import { Loading } from '@/components/Loading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { Editor } from '@/lib/monaco/MonacoEditor';
import { WORKER_FREE_JSON_LANGUAGE_ID } from '@/lib/monaco/workerFreeJsonLanguage';
import { Save, Trash, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { isRecordJsonProbablyValid, tryParseRecordJson } from './recordEditorJson';

export function EditTableRowModal({
	canEditRecords,
	canDeleteRecords,
	setIsModalOpen,
	isModalOpen,
	primaryKey,
	missingPrimaryKey,
	recordUnavailable,
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

	// This modal instance is reused across rows (it stays mounted; only `open`
	// toggles), so the draft/validity have to be reset when a different record is
	// loaded — otherwise a previous row's edit could be saved for, or classify, the
	// newly opened row. Resetting during render (not in an effect) avoids a frame
	// where the stale draft is still live.
	const [recordSnapshot, setRecordSnapshot] = useState(value);
	if (value !== recordSnapshot) {
		setRecordSnapshot(value);
		setUpdatedTableRecordData(undefined);
		setIsValidJSON(true);
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
								onChange={(updatedValue) => {
									setUpdatedTableRecordData(updatedValue);
									setMadeChanges(true);
									setIsValidJSON(isRecordJsonProbablyValid(updatedValue));
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
								disabled={isDeleteTableRecordsPending}
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
									if (!updatedTableRecordData) {
										setIsModalOpen(false);
										return;
									}
									// Authoritative parse: the live check skips oversized content, so a large,
									// malformed edit can reach here with isValidJSON still true — parse it in a
									// catch rather than letting Save throw an uncaught SyntaxError.
									const parsed = tryParseRecordJson(updatedTableRecordData);
									if (!parsed.ok) {
										toast.error("This record isn't valid JSON — fix the syntax and try again.");
										return;
									}
									onSaveChanges(parsed.value as Record<string, unknown>[]);
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
