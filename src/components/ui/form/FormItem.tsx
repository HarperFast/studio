import { FormItemContext as FormItemContext1 } from '@/components/ui/form/formItemContext';
import { cn } from '@/lib/cn';
import { ComponentProps, useId } from 'react';

export function FormItem({ className, ...props }: ComponentProps<'div'>) {
	const id = useId();

	return (
		<FormItemContext1 value={{ id }}>
			<div data-slot="form-item" className={cn('grid gap-2', className)} {...props} />
		</FormItemContext1>
	);
}
