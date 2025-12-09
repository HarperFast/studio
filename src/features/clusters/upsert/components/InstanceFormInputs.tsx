import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { defaultOperationsApiPort } from '@/config/constants';
import { UpsertClusterSchemaType } from '@/features/clusters/upsert/upsertClusterSchema';
import { maxPortNumber, minPortNumber } from '@/lib/types/portNumbers';
import { TrashIcon } from 'lucide-react';
import { useCallback } from 'react';
import { Control, UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';

type InstanceFormInputsProps = {
	control: Control<UpsertClusterSchemaType>;
	fieldArray: UseFieldArrayReturn<UpsertClusterSchemaType, 'instances'>;
	form: UseFormReturn<UpsertClusterSchemaType>;
	index: number;
};

export function InstanceFormInputs({
	control,
	fieldArray,
	form,
	index,
}: InstanceFormInputsProps) {
	const onRemoveClicked = useCallback(() => {
		fieldArray?.remove(index);
	}, [fieldArray, index]);

	return (
		<div className="md:col-span-6 col-span-3 p-4 rounded-md bg-accent gap-6 flex flex-wrap items-start">
			<FormField
				control={control}
				name={`instances.${index}.secure`}
				render={({ field }) => (
					<FormItem>
						<FormLabel>Instance {fieldArray.fields.length > 1 ? index + 1 : ''}</FormLabel>
						<FormControl>
							<Select
								{...field}
								onValueChange={value => {
									field.onChange(value);
									void form.trigger();
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="https://" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="true">https://</SelectItem>
										<SelectItem value="false">http://</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			<FormField
				control={control}
				name={`instances.${index}.fqdn`}
				render={({ field }) => (
					<FormItem className="flex-3">
						<FormLabel>Host Name</FormLabel>
						<FormControl>
							<Input
								{...field}
								type="text"
								autoCapitalize="none"
								autoComplete="off"
								autoCorrect="off"
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			<FormField
				control={control}
				name={`instances.${index}.port`}
				render={({ field }) => (
					<FormItem>
						<FormLabel>Operations API Port</FormLabel>
						<FormControl>
							<Input
								{...field}
								type="number"
								min={minPortNumber}
								max={maxPortNumber}
								autoCapitalize="none"
								autoComplete="off"
								autoCorrect="off"
								placeholder={String(defaultOperationsApiPort)}
								onChange={e => {
									field.onChange(e.target.value ? parseInt(e.target.value, 10) : undefined);
									void form.trigger();
								}}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			{fieldArray?.fields?.length && fieldArray?.fields?.length > 1 && (
				<div className="flex-none mt-6">
					<Button
						type="button"
						variant="destructiveOutline"
						size="sm"
						onClick={onRemoveClicked}
					>
						<TrashIcon /> <span className="sr-only">Remove</span>
					</Button>
				</div>
			)}
		</div>
	);
}
