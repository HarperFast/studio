import { useFormField } from '@/components/ui/form/useFormField';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';
import * as LabelPrimitive from '@radix-ui/react-label';
import { ComponentProps } from 'react';

export function FormLabel({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
	const { error, formItemId } = useFormField();

	return (
		<Label
			data-slot="form-label"
			data-error={!!error}
			className={cn('data-[error=true]:text-destructive', className)}
			htmlFor={formItemId}
			{...props}
		/>
	);
}
