import { SubNavMenu } from '@/components/SubNavMenu';
import { ReactNode } from 'react';

export function SubNavSimpleLayout({ children }: { children: ReactNode }) {
	return (<>
		<SubNavMenu />
		<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))] relative">
			{children}
		</div>
	</>);
}
