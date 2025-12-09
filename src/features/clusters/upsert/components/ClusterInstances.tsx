import { Button } from '@/components/ui/button';
import { defaultOperationsApiPort } from '@/config/constants';
import { UpsertClusterSchemaType } from '@/features/clusters/upsert/upsertClusterSchema';
import { PlusIcon } from 'lucide-react';
import { useCallback } from 'react';
import { useFieldArray, UseFormReturn } from 'react-hook-form';
import { InstanceFormInputs } from './InstanceFormInputs';

interface ClusterInstancesProps {
	form: UseFormReturn<UpsertClusterSchemaType>;
}

export function ClusterInstances({
	form,
}: ClusterInstancesProps) {
	const instancesFieldArray = useFieldArray({
		control: form.control,
		name: 'instances',
	});

	const onAddInstanceClick = useCallback(() => {
		instancesFieldArray.append({
			secure: 'true',
			fqdn: '',
			port: defaultOperationsApiPort,
		});
	}, [instancesFieldArray]);

	return (
		<>
			{instancesFieldArray.fields.map((field, index) => (
				<InstanceFormInputs
					control={form.control}
					fieldArray={instancesFieldArray}
					form={form}
					index={index}
					key={field.id}
				/>
			))}

			<div className="md:col-span-6 col-span-3">
				<Button
					type="button"
					variant="positiveOutline"
					className="rounded-full"
					onClick={onAddInstanceClick}
				>
					<PlusIcon />
					Add Instance
				</Button>
			</div>
		</>
	);
}
