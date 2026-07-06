import { parseFileExtension } from '@/lib/string/parseFileExtension';

export interface MarkupImageType {
	/** MIME type used to build the `data:` URL for the preview. */
	mime: string;
}

/**
 * Markup-based image formats: images whose source is human-editable text rather
 * than binary. The Applications editor previews these like any other image, but
 * — because the source is just text — also lets the user drop down and edit the
 * markup directly, the same "preview by default, edit as text on demand" pattern
 * the `.env` editor uses.
 *
 * In practice this is only SVG: it is the one text/markup image format browsers
 * render in an `<img>`. Other text-ish image formats (X BitMap, X PixMap, the
 * Netpbm PBM/PGM/PPM family) aren't renderable inline, so there is nothing to
 * preview — they're plain text files and fall through to the text editor. Raster
 * and other binary images (PNG, JPG, …) can't be edited as text and stay
 * preview-only (see {@link import('./mediaFileType').getMediaFileType}).
 */
const markupImageTypesByExtension: Record<string, MarkupImageType> = {
	svg: { mime: 'image/svg+xml' },
};

/** Returns the markup-image type for a filename, or undefined if it is not one. */
export function getMarkupImageType(filename: string | undefined): MarkupImageType | undefined {
	return markupImageTypesByExtension[parseFileExtension(filename).toLowerCase()];
}

/**
 * True when the file is a markup-based image. Unlike raster media (loaded as
 * base64), these are loaded as text so they can be both previewed and edited as
 * source.
 */
export function isMarkupImageFile(filename: string | undefined): boolean {
	return getMarkupImageType(filename) !== undefined;
}
