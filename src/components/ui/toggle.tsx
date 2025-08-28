import * as React from 'react';
import * as TogglePrimitive from '@radix-ui/react-toggle';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

const toggleVariants = cva(
	`inline-flex 
  items-center 
  justify-center 
  gap-2 
  whitespace-nowrap 
  rounded-lg 
  text-sm  
  transition-[color,box-shadow] 
  disabled:pointer-events-none 
  disabled:opacity-50 
  [&_svg]:pointer-events-none 
  [&_svg:not([class*='size-'])]:size-4 
  [&_svg]:shrink-0 
  ring-ring/10 
  dark:ring-ring/20 
  dark:outline-ring/40 
  outline-ring/50 
  focus-visible:ring-1 
  focus-visible:outline-1 
  focus-visible:ring-purple-200 
  aria-invalid:focus-visible:ring-0`,
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
				outline: 'border bg-default border-primary border-2 text-white shadow-xs hover:-translate-y-1 transition duration-200 hover:bg-grey-700/40',
			},
			size: {
				default: 'h-9 px-4 py-2 has-[>svg]:px-3',
				sm: 'h-8 px-1.5 min-w-8',
				lg: 'h-10 px-2.5 min-w-10',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	}
);

function Toggle({
	className,
	variant,
	size,
	...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
	return (
		<TogglePrimitive.Root data-slot="toggle" className={cn(toggleVariants({ variant, size, className }))} {...props} />
	);
}

export { Toggle, toggleVariants };
