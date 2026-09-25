import type { KeyboardEvent } from 'react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

export function revealFieldErrorOnEnter<T extends FieldValues>(form: UseFormReturn<T>) {
	return (event: KeyboardEvent<HTMLFormElement>) => {
		const input = event.target;
		if (
			event.key !== 'Enter'
			|| event.nativeEvent.isComposing
			|| !(input instanceof HTMLInputElement)
			|| !input.name
		) {
			return;
		}
		const name = input.name as Path<T>;
		const value = form.getValues(name);
		if (value !== undefined) {
			form.setValue(name, value, { shouldTouch: true, shouldValidate: true });
		}
	};
}
