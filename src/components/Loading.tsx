interface LoadingProps extends React.ComponentProps<'div'> {
	text?: string;
	centered?: boolean;
}

export function Loading({ className, text, centered, ...props }: LoadingProps) {
	const additionalClassName = centered ? 'flex flex-col items-center justify-center h-full' : '';
	return (
		<div className={`text-white h-full w-full ${className || ''} ${additionalClassName}`} {...props}>
			<img src="/HDBDogOnly.svg" width="100px" height="100px" alt="HDB Dog Logo Loading" className="inline-block" />
			<p className="pt-4">{!text ? 'Loading...' : text}</p>
		</div>
	);
}
