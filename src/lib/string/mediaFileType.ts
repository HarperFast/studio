import { parseFileExtension } from '@/lib/string/parseFileExtension';

export type MediaKind = 'image' | 'video';

export interface MediaFileType {
	kind: MediaKind;
	/** MIME type used to build the blob/data URL for the preview. */
	mime: string;
}

/**
 * Maps file extensions the Applications editor can preview as media (rather than
 * editing as text) to their kind and MIME type. Limited to formats browsers can
 * render in an `<img>`/`<video>` element.
 */
const mediaTypesByExtension: Record<string, MediaFileType> = {
	// Images
	apng: { kind: 'image', mime: 'image/apng' },
	avif: { kind: 'image', mime: 'image/avif' },
	bmp: { kind: 'image', mime: 'image/bmp' },
	gif: { kind: 'image', mime: 'image/gif' },
	ico: { kind: 'image', mime: 'image/x-icon' },
	jfif: { kind: 'image', mime: 'image/jpeg' },
	jpeg: { kind: 'image', mime: 'image/jpeg' },
	jpg: { kind: 'image', mime: 'image/jpeg' },
	png: { kind: 'image', mime: 'image/png' },
	svg: { kind: 'image', mime: 'image/svg+xml' },
	webp: { kind: 'image', mime: 'image/webp' },
	// Videos
	m4v: { kind: 'video', mime: 'video/mp4' },
	mov: { kind: 'video', mime: 'video/quicktime' },
	mp4: { kind: 'video', mime: 'video/mp4' },
	ogv: { kind: 'video', mime: 'video/ogg' },
	webm: { kind: 'video', mime: 'video/webm' },
};

/** Returns the previewable media type for a filename, or undefined if it is not media. */
export function getMediaFileType(filename: string | undefined): MediaFileType | undefined {
	return mediaTypesByExtension[parseFileExtension(filename).toLowerCase()];
}

/** True when the file should be loaded as binary (base64) and previewed as media instead of text. */
export function isMediaFile(filename: string | undefined): boolean {
	return getMediaFileType(filename) !== undefined;
}
