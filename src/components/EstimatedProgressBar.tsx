import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export function EstimatedProgressBar({ duration, message, lateMessage }: { duration: number, message: ReactNode, lateMessage: ReactNode }) {
	const animationFrameId = useRef<number>(0);
	const previousTimeRef = useRef<number>(0);
	const [finished, setFinished] = useState(false);
	const minPercentage = 5;
	const [style, setStyle] = useState({ width: `${minPercentage}%` });

	const animate = useCallback((time: number) => {
		if (!previousTimeRef.current) {
			previousTimeRef.current = time;
		}
		const timeElapsed = time - previousTimeRef.current;
		const percentage = Math.min(timeElapsed / duration, 1);
		setStyle({ width: Math.max(minPercentage, percentage * 100) + '%' });

		if (percentage < 1) {
			animationFrameId.current = requestAnimationFrame(animate);
		} else {
			setFinished(true);
		}
	}, [duration]);

	useEffect(() => {
		animationFrameId.current = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(animationFrameId.current);
	}, [animate]);

	return (<>
		{!finished ? message : lateMessage}
		<div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
			<div
				className="bg-purple-600 h-2.5 rounded-full dark:bg-purple-500 mt-2"
				style={style}
			></div>
		</div>
	</>);
}
