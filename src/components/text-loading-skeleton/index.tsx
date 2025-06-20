import { useMemo } from 'react';

export function TextLoadingSkeleton({ className }: { className?: string } = {}) {
	const computedClassName = useMemo(() => `animate-pulse ${className} h-2.5 w-48 bg-gray-200 rounded-full dark:bg-gray-700 mb-4`, [className]);
	return <div className={computedClassName}></div>;
}
