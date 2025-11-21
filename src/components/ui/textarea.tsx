import { cn } from '@/lib/cn';
import * as React from 'react';

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
	return (
		<textarea
			data-slot="input"
			className={cn(
				`border-input file:text-foreground placeholder:text-muted-foreground selection:bg-purple
        selection:text-primary-foreground
        dark:aria-invalid:outline-destructive dark:aria-invalid:ring-destructive/50 ring-ring/10
        dark:ring-ring/20 dark:outline-ring/40 outline-ring/50 aria-invalid:outline-destructive/60
        aria-invalid:ring-destructive/20 aria-invalid:border-destructive/60 dark:aria-invalid:border-destructive
        flex w-full min-w-0 rounded-md border bg-grey-700 px-3 py-1 text-base text-white
        file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium
        focus-visible:ring-1 focus-visible:outline-none focus-visible:ring-purple  disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50
        aria-invalid:focus-visible:ring-[1px] aria-invalid:focus-visible:outline-none md:text-sm dark:aria-invalid:focus-visible:ring-1`,
				className,
			)}
			{...props}
		/>
	);
}
