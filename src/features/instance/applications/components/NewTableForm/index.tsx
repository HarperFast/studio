import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatabaseName } from '@/features/instance/applications/components/NewTableForm/DatabaseName';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { FieldType } from '@/integrations/api/instance/database/fieldType';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { useSetWatchedValue } from '@/lib/events/watcher';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, Plus, PlusIcon, TrashIcon } from 'lucide-react';
import { useCallback } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { newTableSchema } from './newTableSchema';
import { OptionalExpiration } from './OptionalExpiration';

export function NewTableForm() {
	const closeModal = useSetWatchedValue('ShowNewTableModal', false);
	const { openedEntry, openedEntryContents } = useEditorView();
	const { setContent } = useEditorFileContent(!!openedEntry && !openedEntry.package && openedEntry.path);

	const methods = useForm({
		resolver: zodResolver(newTableSchema),
		defaultValues: {
			tableName: '',
			databaseName: 'data',
			expiration: '',
			enableRest: true,
			sealed: true,
			tableFields: [
				{
					fieldName: 'id',
					fieldType: FieldType.ID,
					primaryKey: true,
					nullable: true,
					indexed: false,
					array: false,
				},
			],
		},
	});
	const { control, handleSubmit, formState } = methods;

	const { fields, append, remove } = useFieldArray({
		name: 'tableFields',
		control,
	});

	const addFieldClicked = useCallback(() => {
		append({
			fieldName: '',
			fieldType: FieldType.String,
			primaryKey: false,
			nullable: false,
			indexed: false,
			array: false,
		});
	}, [append]);

	const submitForm = useCallback(async (formData: z.infer<typeof newTableSchema>) => {
		setContent(existingContent => {
			const prefix = existingContent || openedEntryContents || '';

			const tableParams = [
				!!formData.databaseName && formData.databaseName !== 'data' && `database: "${formData.databaseName}"`,
				!!formData.expiration && formData.expiration > 0 && `expiration: ${formData.expiration}`,
			].filter(excludeFalsy);
			const joinedTableParams = tableParams.length ? `(${tableParams.join(', ')})` : '';
			const maybeExport = formData.enableRest ? ' @export' : '';
			const maybeSealed = formData.sealed ? ' @sealed' : '';
			const fieldDefinitions = formData.tableFields.map(tableField => {
				const fieldType = tableField.array ? `[${tableField.fieldType}]` : tableField.fieldType;
				const maybeNullable = tableField.nullable ? '' : '!';
				const maybePK = tableField.primaryKey ? ' @primaryKey' : '';
				const maybeIndexed = tableField.indexed ? ' @indexed' : '';
				return `\n\t${tableField.fieldName}: ${fieldType}${maybeNullable}${maybePK}${maybeIndexed}`;
			}).join('');

			return `${prefix}\ntype ${formData.tableName} @table${joinedTableParams}${maybeExport}${maybeSealed} {${fieldDefinitions}\n}\n`;
		});
		closeModal();
	}, [setContent, closeModal, openedEntryContents]);

	return (
		<Form {...methods}>
			<form onSubmit={handleSubmit(submitForm)}>
				<FormField
					control={control}
					name="tableName"
					render={({ field }) => (
						<FormItem className="my-4">
							<FormLabel>Table Name</FormLabel>
							<FormControl>
								<Input type="text" className="my-1" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<h3 className="text-lg">Table Fields</h3>

				{fields.map((field, index) => (
					<div key={field.id} className="p-4 my-2 border rounded-lg">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<FormField
								control={control}
								name={`tableFields.${index}.fieldName`}
								render={({ field }) => (
									<FormItem>
										<FormLabel>Field Name</FormLabel>
										<FormControl>
											<Input type="text" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={control}
								name={`tableFields.${index}.fieldType`}
								render={({ field }) => (
									<FormItem>
										<FormLabel>Type</FormLabel>
										<FormControl>
											<Select {...field} onValueChange={field.onChange} defaultValue={field.value}>
												<SelectTrigger className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="Any">Any</SelectItem>
													<SelectItem value="BigInt">BigInt</SelectItem>
													<SelectItem value="Blob">Blob</SelectItem>
													<SelectItem value="Boolean">Boolean</SelectItem>
													<SelectItem value="Bytes">Bytes</SelectItem>
													<SelectItem value="Date">Date</SelectItem>
													<SelectItem value="Float">Float</SelectItem>
													<SelectItem value="ID">ID</SelectItem>
													<SelectItem value="Int">Int</SelectItem>
													<SelectItem value="Long">Long</SelectItem>
													<SelectItem value="String">String</SelectItem>
												</SelectContent>
											</Select>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex flex-wrap items-center mt-2 gap-x-2 md:gap-x-4">
							<FormField
								control={control}
								name={`tableFields.${index}.indexed`}
								render={({ field }) => (
									<FormItem className="inline-flex">
										<FormControl>
											<Input
												type="checkbox"
												className="w-5"
												checked={field.value}
												onChange={(e) => field.onChange(e.target.checked)}
											/>
										</FormControl>
										<FormLabel className="flex-1 py-2.5">Indexed</FormLabel>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={control}
								name={`tableFields.${index}.primaryKey`}
								render={({ field }) => (
									<FormItem className="inline-flex">
										<FormControl>
											<Input
												type="checkbox"
												className="w-5"
												checked={field.value}
												onChange={(e) => field.onChange(e.target.checked)}
											/>
										</FormControl>
										<FormLabel className="flex-1 py-2.5">Primary Key</FormLabel>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={control}
								name={`tableFields.${index}.nullable`}
								render={({ field }) => (
									<FormItem className="inline-flex">
										<FormControl>
											<Input
												type="checkbox"
												className="w-5"
												checked={field.value}
												onChange={(e) => field.onChange(e.target.checked)}
											/>
										</FormControl>
										<FormLabel className="flex-1 py-2.5">Nullable</FormLabel>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={control}
								name={`tableFields.${index}.array`}
								render={({ field }) => (
									<FormItem className="inline-flex">
										<FormControl>
											<Input
												type="checkbox"
												className="w-5"
												checked={field.value}
												onChange={(e) => field.onChange(e.target.checked)}
											/>
										</FormControl>
										<FormLabel className="flex-1 py-2.5">Array</FormLabel>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="grow"></div>
							<Button type="button" variant="destructiveGhost" className="rounded-full" onClick={() => remove(index)}>
								<TrashIcon /> Remove Field
							</Button>
						</div>
					</div>
				))}

				<Button
					variant="ghost"
					type="button"
					className="w-full"
					onClick={addFieldClicked}
				>
					<Plus /> Add Another Field
				</Button>

				<hr className="my-6 border-gray-600" />

				<FormField
					control={control}
					name="databaseName"
					render={({ field }) => <DatabaseName field={field} />}
				/>
				<FormField
					control={control}
					name="expiration"
					render={({ field }) => <OptionalExpiration field={field} />}
				/>
				<FormField
					control={control}
					name="enableRest"
					render={({ field }) => (
						<FormItem className="flex">
							<FormControl>
								<Input
									type="checkbox"
									className="w-5"
									checked={field.value}
									onChange={(e) => field.onChange(e.target.checked)}
								/>
							</FormControl>
							<FormLabel className="flex-1 py-2.5">
								Make available as a REST endpoint (add{' '}
								<code className="text-muted-foreground italic ml-1">@export</code>)
							</FormLabel>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={control}
					name="sealed"
					render={({ field }) => (
						<FormItem className="flex">
							<FormControl>
								<Input
									type="checkbox"
									className="w-5"
									checked={field.value}
									onChange={(e) => field.onChange(e.target.checked)}
								/>
							</FormControl>
							<FormLabel className="flex-1 py-2.5">
								Sealed (add
								<code className="text-muted-foreground italic ml-1">@sealed</code> to ignore unspecified properties)
							</FormLabel>
							<FormMessage />
						</FormItem>
					)}
				/>

				<div className="text-muted-foreground italic text-sm pb-2">
					There are even more directives available to you when editing your schema.graphql by hand! You can read more
					about them{' '}
					<a
						className="underline"
						target="_blank"
						rel="noreferrer"
						href="https://docs.harperdb.io/docs/developers/applications/defining-schemas"
					>
						in our documentation
					</a>.
				</div>

				<div className="flex w-full gap-4 sticky -bottom-6 pb-6 pt-4 bg-black">
					<Button variant="ghost" className="w-full rounded-full" onClick={closeModal}>
						<Ban /> Cancel
					</Button>
					<Button
						variant="positive"
						type="submit"
						className="w-full rounded-full"
						disabled={!formState.isValid}
					>
						<PlusIcon /> New Table
					</Button>
				</div>
			</form>
		</Form>
	);
}
