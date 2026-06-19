import { parseFileExtension } from '@/lib/string/parseFileExtension';

/**
 * Extensions of files that are binary and cannot be meaningfully edited or
 * previewed as text. Decoding these as UTF-8 and handing them to the Monaco
 * editor produces a wall of garbage (and, for a large archive, a multi-megabyte
 * string that can lock up the editor), so the Applications view shows a
 * "can't preview" placeholder for them instead.
 *
 * Media formats the editor *can* preview (images/videos) are handled separately
 * by {@link import('./mediaFileType').getMediaFileType} and are intentionally
 * left out of this list.
 *
 * Extensions are matched against the final segment only (see
 * {@link parseFileExtension}), so `archive.tar.gz` matches via `gz`.
 */
const binaryExtensions = new Set([
	// Compressed archives — the case this list was originally added for.
	'7z',
	'br',
	'bz2',
	'bzip2',
	'cab',
	'gz',
	'gzip',
	'lz',
	'lz4',
	'lzma',
	'rar',
	'tar',
	'tbz',
	'tbz2',
	'tgz',
	'txz',
	'xz',
	'z',
	'zip',
	'zst',
	'zstd',
	// Executables, libraries, and other compiled artifacts.
	'a',
	'bin',
	'class',
	'dll',
	'dylib',
	'exe',
	'jar',
	'node',
	'o',
	'so',
	'wasm',
	// Fonts.
	'eot',
	'otf',
	'ttf',
	'woff',
	'woff2',
	// Audio.
	'aac',
	'flac',
	'm4a',
	'mp3',
	'oga',
	'ogg',
	'opus',
	'wav',
	'wma',
	// Binary images the browser can't render inline (so not handled as media).
	'heic',
	'heif',
	'psd',
	'tif',
	'tiff',
	// Other binary documents and databases.
	'db',
	'pdf',
	'sqlite',
	'sqlite3',
]);

/** True when the file is a binary type that can't be opened in the text editor. */
export function isBinaryFile(filename: string | undefined): boolean {
	return binaryExtensions.has(parseFileExtension(filename).toLowerCase());
}
