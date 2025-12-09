import { iconSharedClassName } from './constants';

export function FileTypeIcon({ extension }: { readonly extension: string | null }) {
	switch (extension) {
		case 'js':
			return <i className={iconSharedClassName + 'filetype-js fab fa-js text-yellow'} />;
		case 'jsx':
			return <i className={iconSharedClassName + 'filetype-jsx fab fa-js text-yellow'} />;
		case 'cjs':
			return <i className={iconSharedClassName + 'filetype-cjs fab fa-js text-yellow'} />;
		case 'yaml':
			return <i className={iconSharedClassName + 'filetype-yaml fas fa-file'} />;
		case 'css':
			return <i className={iconSharedClassName + 'filetype-css fas fa-file text-blue'} />;
		case 'html':
			return <i className={iconSharedClassName + 'filetype-unknown far fa-file-alt'} />; // NOTE: Using unknown icon for HTML file due to not finding one in font awesome.
		case 'json':
			return <i className={iconSharedClassName + 'filetype-json fas fa-cog'} />;
		case 'ts':
			return <i className={iconSharedClassName + 'filetype-ts fas fa-file text-blue'} />;
		case 'tsx':
			return <i className={iconSharedClassName + 'filetype-tsx fas fa-file text-blue'} />;
		case 'png':
			return <i className={iconSharedClassName + 'filetype-png fas fa-image'} />;
		case 'jpg':
			return <i className={iconSharedClassName + 'filetype-jpg fas fa-image'} />;
		case 'jpeg':
			return <i className={iconSharedClassName + 'filetype-jpeg fas fa-image'} />;
		case 'gif':
			return <i className={iconSharedClassName + 'filetype-gif fas fa-image'} />;
		case 'svg':
			return <i className={iconSharedClassName + 'filetype-svg fas fa-file-svg'} />;
		case 'vue':
			return <i className={iconSharedClassName + 'filetype-vue fab fa-vuejs text-green'} />;
		default:
			return <i className={iconSharedClassName + 'filetype-unknown far fa-file-alt'} />;
	}
}
