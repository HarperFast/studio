import { iconSharedClassName } from './constants';

export function LockedIcon() {
	return <i className={iconSharedClassName + 'fas fa-lock text-gray-400 ml-2 packageIsLocked'} />;
}
