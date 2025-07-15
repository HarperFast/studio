import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/cn';
import * as React from 'react';

export function SidebarSeparator({
	className,
	...props
}: React.ComponentProps<typeof Separator>) {
	return (
		<Separator
			data-slot="sidebar-separator"
			data-sidebar="separator"
			className={cn('bg-sidebar-border mx-2 w-auto', className)}
			{...props}
		/>
	);
}
