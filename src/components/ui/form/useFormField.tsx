import { FormFieldContext } from '@/components/ui/form/formFieldContext';
import { FormItemContext } from '@/components/ui/form/formItemContext';
import { useContext } from 'react';
import { FieldError, get, useFormState } from 'react-hook-form';

export function useFormField() {
	const fieldContext = useContext(FormFieldContext);
	const itemContext = useContext(FormItemContext);
	// Only `errors`: getFieldState(name, formState) also subscribes to validatingFields, which react-hook-form
	// sets while a newly shown field registers, so every label and message would update mid-render.
	const { errors } = useFormState({ name: fieldContext.name });
	const error: FieldError | undefined = get(errors, fieldContext.name);

	if (!fieldContext) {
		throw new Error('useFormField should be used within <FormField>');
	}

	const { id } = itemContext;

	return {
		id,
		name: fieldContext.name,
		formItemId: `${id}-form-item`,
		formDescriptionId: `${id}-form-item-description`,
		formMessageId: `${id}-form-item-message`,
		error,
	};
}
