import { cx } from 'class-variance-authority';
import { useMemo } from 'react';

export function TextLoadingSkeleton({ className }: { className?: string } = {}) {
	const computedClassName = useMemo(() =>
		cx(
			`animate-pulse h-2.5 bg-gray-200 rounded-full dark:bg-gray-700`,
			!className?.includes('mb-') && 'mb-4 ',
			!className?.includes('w-') && 'w-48 ',
			className,
		), [className]);
	return <div className={computedClassName}></div>;
}
