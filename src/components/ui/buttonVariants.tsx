import { cva } from 'class-variance-authority';

const hoverBounce = 'hover:-translate-y-1 transition duration-200';
const outlineCommon = 'border bg-transparent border-2 text-white shadow-xs hover:bg-grey-700/40';
export const buttonVariants = cva(
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
				submit:
					'bg-gradient-to-r from-blue-100 from-0% to-blue to-100% hover:bg-gradient-to-r hover:from-blue text-primary-foreground shadow-sm',
				destructive: 'bg-destructive shadow-xs hover:bg-destructive/90',
				secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
				ghost: 'hover:bg-accent hover:text-muted-foreground',
				destructiveGhost: 'hover:bg-accent hover:text-red',
				link: 'text-primary underline-offset-4 hover:underline',
				positive: 'bg-green text-white shadow-xs hover:bg-green/90',
				warning: 'bg-yellow text-white shadow-xs hover:bg-yellow/90',
				outline: `${outlineCommon} ${hoverBounce}`,
				ghostOutline: `${outlineCommon} ${hoverBounce} border-none`,
				positiveOutline: `${outlineCommon} ${hoverBounce} border-green`,
				destructiveOutline: `${outlineCommon} ${hoverBounce} border-destructive`,
				defaultOutline: `${outlineCommon} ${hoverBounce} border-primary`,
			},
			size: {
				default: 'h-9 px-4 py-2 has-[>svg]:px-3',
				sm: 'h-8 rounded-md px-3 has-[>svg]:px-2.5',
				lg: 'h-10 rounded-md px-6 has-[>svg]:px-4 text-md',
				icon: 'size-9',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);
