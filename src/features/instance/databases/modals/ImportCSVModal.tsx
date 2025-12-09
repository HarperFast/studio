import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { AddCSVDataFormData, useAddCSVDataMutation } from '@/integrations/api/instance/database/addCSVData';
import { AddCSVDataFormSchema } from '@/integrations/api/instance/database/addCSVDataFormSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { CloudUploadIcon, Save } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

export function ImportCSVModal({
	setIsModalOpen,
	isModalOpen,
	onSaveChanges,
	database,
	table,
}: {
	setIsModalOpen: (open: boolean) => void;
	isModalOpen: boolean;
	onSaveChanges: (message: string) => void;
	database: string;
	table: string;
}) {
	const [selectedCSVFile, setSelectedCSVFile] = useState<File | null>(null);
	const instanceParams = useInstanceClientIdParams();
	const { mutate: addCSVData, isPending: isAddCSVDataPending } = useAddCSVDataMutation();

	const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!e.target.files) { return; }
		const file = e.target.files[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (event) => {
				const text = event.target?.result;
				if (typeof text === 'string') {
					setSelectedCSVFile(file);
					form.setValue('fileData', text);
				}
			};
			reader.readAsText(file);
		}
	};

	const form = useForm({
		resolver: zodResolver(AddCSVDataFormSchema),
		defaultValues: {
			database,
			table,
			fileData: '',
		},
	});

	const submitForm = (formData: AddCSVDataFormData) => {
		addCSVData(
			{
				fileData: formData.fileData,
				database,
				table,
				...instanceParams,
			},
			{
				onSuccess: ({ message }: { message: string }) => {
					form.reset();
					setSelectedCSVFile(null);
					onSaveChanges(message);
				},
			},
		);
	};

	return (
		<Dialog
			onOpenChange={() => {
				setIsModalOpen(false);
				form.reset();
			}}
			open={isModalOpen}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Import CSV</DialogTitle>
					<DialogDescription>Upload a CSV file to import data into the table.</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submitForm)}>
						<div className="w-full">
							<FormField
								control={form.control}
								name="fileData"
								render={({ field }) => (
									<FormItem className="relative">
										<FormLabel
											htmlFor="dropzone-file"
											className="flex flex-col items-center justify-center w-full h-64 border-2 border-grey border-dashed rounded-lg cursor-pointer bg-grey-700 hover:bg-grey-700/80"
										>
											<FormControl>
												<div>
													<div className="flex flex-col items-center justify-center pt-5 pb-6">
														<CloudUploadIcon className="text-white" size={48} />
														<p className="mb-2 text-sm text-white">
															{selectedCSVFile
																? (
																	selectedCSVFile.name
																)
																: (
																	<>
																		<span className="font-semibold">Click to upload</span> or drag and drop a CSV File
																	</>
																)}
														</p>
													</div>
													<Input
														id="dropzone-file"
														type="file"
														className="opacity-0 w-full h-full absolute left-0 top-0 cursor-pointer"
														accept=".csv"
														name={field.name}
														ref={field.ref}
														onBlur={field.onBlur}
														disabled={field.disabled}
														onChange={onFileChange}
													/>
												</div>
											</FormControl>
										</FormLabel>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<DialogFooter className="mt-4">
							<Button
								variant="submit"
								className="rounded-full"
								accessKey="u"
								disabled={!selectedCSVFile || isAddCSVDataPending}
							>
								<Save />
								<span>
									<u>U</u>pload CSV
								</span>
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
