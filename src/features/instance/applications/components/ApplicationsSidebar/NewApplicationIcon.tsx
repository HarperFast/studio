import { PlusIcon } from 'lucide-react';
import { iconSharedClassName } from './constants';

export function NewApplicationIcon() {
	return <PlusIcon className={iconSharedClassName + 'w-4 h-4 shrink-0 text-green-500'} />;
}
