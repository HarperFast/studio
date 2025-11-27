import { parseFileExtension } from '@/lib/string/parseFileExtension';

export function hasImageFileExtension(filename: string | undefined): boolean {
	const extension = parseFileExtension(filename).toLowerCase();
	switch (extension) {
		case 'jpg':
		case 'jpeg':
		case 'gif':
		case 'png':
		case 'pneg':
		case 'webp':
			return true;
		default:
			return false;
	}
}
