import { FormFieldContext as FormFieldContext1 } from '@/components/ui/form/formFieldContext';
import { Controller, ControllerProps, FieldPath, FieldValues } from 'react-hook-form';

export function FormField<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
	...props
}: ControllerProps<TFieldValues, TName>) {
	return (
		<FormFieldContext1 value={{ name: props.name }}>
			<Controller {...props} />
		</FormFieldContext1>
	);
}
