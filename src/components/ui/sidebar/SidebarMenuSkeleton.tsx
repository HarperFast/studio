import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { ComponentProps, CSSProperties, useMemo } from 'react';

export function SidebarMenuSkeleton({
	className,
	showIcon = false,
	...props
}: ComponentProps<'div'> & {
	showIcon?: boolean
}) {
	// Random width between 50 to 90%.
	const width = useMemo(() => {
		// The memo has no dependencies, so the random ends up being stable.
		// eslint-disable-next-line react-hooks/purity
		return `${Math.floor(Math.random() * 40) + 50}%`;
	}, []);

	return (
		<div
			data-slot="sidebar-menu-skeleton"
			data-sidebar="menu-skeleton"
			className={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
			{...props}
		>
			{showIcon && (
				<Skeleton
					className="size-4 rounded-md"
					data-sidebar="menu-skeleton-icon"
				/>
			)}
			<Skeleton
				className="h-4 max-w-(--skeleton-width) flex-1"
				data-sidebar="menu-skeleton-text"
				style={
					{
						'--skeleton-width': width,
					} as CSSProperties
				}
			/>
		</div>
	);
}
