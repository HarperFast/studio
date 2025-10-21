import { iconSharedClassName } from './constants';

export function DirectoryIcon({ opened }: { readonly opened?: boolean }) {
	return opened
		? <i className={iconSharedClassName + 'fas fa-folder-open text-orange-400'} />
		: <i className={iconSharedClassName + 'fas fa-folder text-orange-400'} />;
}
