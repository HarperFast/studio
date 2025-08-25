import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ReactNode } from 'react';

export function SubNavMenu({ children }: { children?: ReactNode }) {
	return (
		<nav className="fixed top-20 w-full md:h-12 z-39 py-2 px-4 md:px-12 bg-grey-700">
			<div className="md:flex items-center h-full space-x-8">
				<Breadcrumbs />
				{children}
			</div>
		</nav>
	);
}
