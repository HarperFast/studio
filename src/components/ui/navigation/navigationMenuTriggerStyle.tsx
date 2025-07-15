import { cva } from 'class-variance-authority';

export const navigationMenuTriggerStyle = cva(
	'group inline-flex h-9 w-max text-grey-400 items-center justify-center px-4 py-2 text-sm font-medium focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-accent/50 data-[state=open]:bg-accent/50 data-[active=true]:text-accent-foreground ring-ring/10 dark:ring-ring/20 dark:outline-ring/40 outline-ring/50 transition-[color,box-shadow] focus-visible:ring-4 focus-visible:outline-1',
);
