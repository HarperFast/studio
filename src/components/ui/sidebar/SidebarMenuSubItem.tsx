import { cn } from '@/lib/cn';
import * as React from 'react';

export function SidebarMenuSubItem({
	className,
	...props
}: React.ComponentProps<'li'>) {
	return (
		<li
			data-slot="sidebar-menu-sub-item"
			data-sidebar="menu-sub-item"
			className={cn('group/menu-sub-item relative', className)}
			{...props}
		/>
	);
}
