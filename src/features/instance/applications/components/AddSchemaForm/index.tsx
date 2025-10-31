import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, TrashIcon } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';

export function AddSchemaForm() {
	const methods = useForm({
		defaultValues: {
			tableName: '',
			isRestEndpoint: 'false',
			noAdditionalProperties: 'false',
			tableFields: [{ fieldName: '', fieldType: 'id', isPrimaryKey: 'true', isNullable: 'false', isIndexed: 'false' }],
		},
	});
	const { control } = methods;

	const { fields, append, remove } = useFieldArray({
		name: 'tableFields',
		control,
	});
	return (
		<Form {...methods}>
			<form>
				<FormField
					control={control}
					name="tableName"
					render={({ field }) => (
						<FormItem className="my-4">
							<FormLabel>Table Name</FormLabel>
							<FormControl>
								<Input type="text" className="my-1" placeholder="Enter Table Name" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={control}
					name="isRestEndpoint"
					render={({ field }) => (
						<FormItem className="flex">
							<FormControl>
								<Input type="checkbox" className="w-5" {...field} />
							</FormControl>
							<FormLabel className="flex-1 py-2.5">Make available as a REST endpoint</FormLabel>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={control}
					name="noAdditionalProperties"
					render={({ field }) => (
						<FormItem className="flex">
							<FormControl>
								<Input type="checkbox" className="w-5" {...field} />
							</FormControl>
							<FormLabel className="flex-1 py-2.5">Do not allow additional properties</FormLabel>
							<FormMessage />
						</FormItem>
					)}
				/>
				<hr className="my-6" />
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-lg">Table Fields</h3>
					<Button
						variant="positiveOutline"
						type="button"
						className="rounded-full"
						onClick={() =>
							append({
								fieldName: '',
								fieldType: 'string',
								isPrimaryKey: 'false',
								isNullable: 'false',
								isIndexed: 'false',
							})}
					>
						<Plus /> Add Field
					</Button>
				</div>
				{fields.map((field, index) => (
					<div key={field.id} className="p-4 my-2 border rounded-lg">
						<div className="grid grid-cols-2 gap-4">
							<FormField
								control={control}
								name={`tableFields.${index}.fieldName`}
								render={({ field }) => (
									<FormItem>
										<FormLabel>Field Name</FormLabel>
										<FormControl>
											<Input type="text" placeholder="id" {...field} />
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
													<SelectValue placeholder="Select the Field Type" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="id">ID</SelectItem>
													<SelectItem value="string">String</SelectItem>
													<SelectItem value="number">Number</SelectItem>
													<SelectItem value="boolean">Boolean</SelectItem>
													<SelectItem value="date">Date</SelectItem>
													<SelectItem value="array">Array</SelectItem>
													<SelectItem value="object">Object</SelectItem>
												</SelectContent>
											</Select>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex-wrap items-center justify-between mt-2 md:flex">
							<div className="flex gap-x-2 md:gap-x-4">
								<FormField
									control={control}
									name={`tableFields.${index}.isIndexed`}
									render={({ field }) => (
										<FormItem className="inline-flex">
											<FormControl>
												<Input type="checkbox" className="w-5" {...field} />
											</FormControl>
											<FormLabel className="flex-1 py-2.5">Indexed</FormLabel>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={control}
									name={`tableFields.${index}.isPrimaryKey`}
									render={({ field }) => (
										<FormItem className="inline-flex">
											<FormControl>
												<Input type="checkbox" className="w-5" {...field} />
											</FormControl>
											<FormLabel className="flex-1 py-2.5">Primary Key</FormLabel>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={control}
									name={`tableFields.${index}.isNullable`}
									render={({ field }) => (
										<FormItem className="inline-flex">
											<FormControl>
												<Input type="checkbox" className="w-5" {...field} />
											</FormControl>
											<FormLabel className="flex-1 py-2.5">Nullable</FormLabel>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							<Button type="button" variant="destructiveOutline" className="rounded-full" onClick={() => remove(index)}>
								<TrashIcon /> Remove Field
							</Button>
						</div>
					</div>
				))}
			</form>
		</Form>
	);
}
