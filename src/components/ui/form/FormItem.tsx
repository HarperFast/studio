import { FormItemContext as FormItemContext1 } from '@/components/ui/form/formItemContext';
import { cn } from '@/lib/cn';
import { ComponentProps, useId } from 'react';

export function FormItem({ className, ...props }: ComponentProps<'div'>) {
	const id = useId();

	return (
		<FormItemContext1 value={{ id }}>
			{/* A bounded column: an auto one grows to its widest control's unwrapped content and spills out. */}
			<div data-slot="form-item" className={cn('grid grid-cols-[minmax(0,1fr)] gap-2', className)} {...props} />
		</FormItemContext1>
	);
}
