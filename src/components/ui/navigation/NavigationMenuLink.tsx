import { cn } from '@/lib/cn';
import * as NavigationMenuPrimitive from '@radix-ui/react-navigation-menu';
import * as React from 'react';

export function NavigationMenuLink({ className, ...props }: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
	return (
		<NavigationMenuPrimitive.Link
			data-slot="navigation-menu-link"
			className={cn(
				'hover:text-white ring-ring/10 dark:ring-ring/20 dark:outline-ring/40 outline-ring/50 flex flex-col gap-1 rounded-sm p-2 text-sm transition-[color,box-shadow] focus-visible:ring-4 focus-visible:outline-1 [&_svg:not([class*=\'size-\'])]:size-4',
				className,
			)}
			{...props}
		/>
	);
}
