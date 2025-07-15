import { cn } from '@/lib/cn';
import * as React from 'react';

export function SidebarGroupContent({
	className,
	...props
}: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="sidebar-group-content"
			data-sidebar="group-content"
			className={cn('w-full text-sm', className)}
			{...props}
		/>
	);
}
