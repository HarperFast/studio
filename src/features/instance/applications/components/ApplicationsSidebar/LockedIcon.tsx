import { LockIcon } from 'lucide-react';
import { iconSharedClassName } from './constants';

export function LockedIcon() {
	return (
		<LockIcon
			className={iconSharedClassName + 'w-4 h-4 shrink-0 text-gray-400 ml-2 packageIsLocked'}
		/>
	);
}
