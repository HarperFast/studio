import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ReactNode } from 'react';

export function SubNavMenu({ children }: { children?: ReactNode }) {
	return (
		<nav className="fixed top-20 w-full h-12 z-39 py-2 px-4 md:px-12 bg-violet-50 border-b border-violet-100 dark:bg-grey-700 dark:border-none">
			<div className="flex items-center h-full space-x-2">
				<Breadcrumbs />
				{children}
			</div>
		</nav>
	);
}
