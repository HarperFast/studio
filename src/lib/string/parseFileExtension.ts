export function parseFileExtension(filename: string | undefined) {
	const parts = (filename || '')?.split('.');
	return parts.length > 1 ? parts.slice(-1)[0] : '';
}
