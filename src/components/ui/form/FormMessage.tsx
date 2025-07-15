import { useFormField } from '@/components/ui/form/useFormField';
import { cn } from '@/lib/cn';
import { ComponentProps } from 'react';

export function FormMessage({ className, ...props }: ComponentProps<'p'>) {
	const { error, formMessageId } = useFormField();
	const body = error ? String(error?.message) : props.children;

	if (!body) {
		return null;
	}

	return (
		<p data-slot="form-message" id={formMessageId} className={cn('text-destructive text-sm', className)} {...props}>
			{body}
		</p>
	);
}
