import { cx } from 'class-variance-authority';
import { LoaderCircleIcon } from 'lucide-react';
import { ComponentProps } from 'react';

export function LoadingSubtle({ className }: ComponentProps<'div'>) {
	return <LoaderCircleIcon className={cx('animate-spin', className)} />;
}
