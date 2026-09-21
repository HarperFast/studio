import { FormFieldContext } from '@/components/ui/form/formFieldContext';
import { FormItemContext } from '@/components/ui/form/formItemContext';
import { useContext } from 'react';
import { useFormContext, useFormState } from 'react-hook-form';

export function useFormField() {
	const fieldContext = useContext(FormFieldContext);
	const itemContext = useContext(FormItemContext);
	const { getFieldState } = useFormContext();
	// Subscribe to errors only. Handing the whole form-state proxy to getFieldState also subscribes
	// this component to isValidating, which react-hook-form (7.88+) flips synchronously while a
	// Controller registers during its own render — a render-phase update of every label and message.
	const { errors } = useFormState({ name: fieldContext.name });
	void errors;
	const fieldState = getFieldState(fieldContext.name);

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
		// Only the error: the rest of the field state is read unsubscribed above and would be stale.
		error: fieldState.error,
	};
}
