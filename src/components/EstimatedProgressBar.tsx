import { ProgressBar } from '@/components/ProgressBar';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export function EstimatedProgressBar({ duration, message, lateMessage }: {
	duration: number,
	message: ReactNode,
	lateMessage: ReactNode
}) {
	const animationFrameId = useRef<number>(0);
	const previousTimeRef = useRef<number>(0);
	const [finished, setFinished] = useState(false);
	const minPercentage = 5;
	const [width, setWidth] = useState(`${minPercentage}%`);

	const animate = useCallback(function animate(time: number) {
		if (!previousTimeRef.current) {
			previousTimeRef.current = time;
		}
		const timeElapsed = time - previousTimeRef.current;
		const percentage = Math.min(timeElapsed / duration, 1);
		setWidth(Math.max(minPercentage, percentage * 100) + '%');

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
		<ProgressBar width={width} animated={false}></ProgressBar>
	</>);
}
