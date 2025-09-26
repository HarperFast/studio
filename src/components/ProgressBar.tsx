import { cx } from 'class-variance-authority';

export function ProgressBar({ width, className, animated, placeholder }: {
	width: string | undefined;
	className?: string;
	animated?: boolean;
	placeholder?: string;
}) {
	return (
		<div className={cx('w-full bg-gray-200 rounded-full relative', placeholder ? 'h-6' : 'h-2.5')}>
			{placeholder && (
				<div className="absolute top-0 h-full w-full font-bold text-xs flex flex-col items-center justify-center text-black/60 text-shadow-2xs">{placeholder}</div>)}
			<div
				className={cx(
					'rounded-full',
					placeholder ? 'h-6' : 'h-2.5',
					!className?.includes('bg-') && 'bg-purple/40',
					animated && 'transition-[width] duration-1000 ease-in-out motion-reduce:transition-none',
					className,
				)}
				style={{
					width,
				}}
			></div>
		</div>
	);
}
