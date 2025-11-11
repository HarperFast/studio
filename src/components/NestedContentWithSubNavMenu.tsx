import { SubNavMenu } from '@/components/SubNavMenu';
import { cx } from 'class-variance-authority';
import { ReactNode } from 'react';

export function NestedContentWithSubNavMenu({ children, className }: { children: ReactNode, className?: string }) {
	return (
		<>
			<SubNavMenu />
			<div className={cx('mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))] flex justify-center', className)}>
				{children}
			</div>
		</>
	);
}
