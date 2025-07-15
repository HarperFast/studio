import { useFormField } from '@/components/ui/form/useFormField';
import { cn } from '@/lib/cn';
import { ComponentProps } from 'react';

export function FormDescription({ className, ...props }: ComponentProps<'p'>) {
	const { formDescriptionId } = useFormField();

	return (
		<p
			data-slot="form-description"
			id={formDescriptionId}
			className={cn('text-muted-foreground text-sm', className)}
			{...props}
		/>
	);
}
