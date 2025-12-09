import { iconSharedClassName } from './constants';

export function DirectoryIcon({ opened, pkg }: { readonly opened?: boolean; readonly pkg?: boolean }) {
	if (pkg) {
		return opened
			? <i className={iconSharedClassName + 'fas fa-box-open text-orange-600'} />
			: <i className={iconSharedClassName + 'fas fa-box text-orange-600'} />;
	}
	return opened
		? <i className={iconSharedClassName + 'fas fa-folder-open text-orange-400'} />
		: <i className={iconSharedClassName + 'fas fa-folder text-orange-400'} />;
}
