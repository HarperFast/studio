import { describe, expect, it } from 'vitest';
import { getMediaFileType, isMediaFile } from './mediaFileType';

describe('getMediaFileType', () => {
	it('classifies images with the correct MIME type', () => {
		expect(getMediaFileType('logo.png')).toEqual({ kind: 'image', mime: 'image/png' });
		expect(getMediaFileType('photo.jpg')).toEqual({ kind: 'image', mime: 'image/jpeg' });
		expect(getMediaFileType('photo.jpeg')).toEqual({ kind: 'image', mime: 'image/jpeg' });
		expect(getMediaFileType('icon.svg')).toEqual({ kind: 'image', mime: 'image/svg+xml' });
		expect(getMediaFileType('favicon.ico')).toEqual({ kind: 'image', mime: 'image/x-icon' });
		expect(getMediaFileType('next-gen.avif')).toEqual({ kind: 'image', mime: 'image/avif' });
	});

	it('classifies videos with the correct MIME type', () => {
		expect(getMediaFileType('demo.mp4')).toEqual({ kind: 'video', mime: 'video/mp4' });
		expect(getMediaFileType('clip.mov')).toEqual({ kind: 'video', mime: 'video/quicktime' });
		expect(getMediaFileType('clip.webm')).toEqual({ kind: 'video', mime: 'video/webm' });
	});

	it('is case-insensitive', () => {
		expect(getMediaFileType('PHOTO.PNG')).toEqual({ kind: 'image', mime: 'image/png' });
		expect(getMediaFileType('Movie.MP4')).toEqual({ kind: 'video', mime: 'video/mp4' });
	});

	it('returns undefined for non-media and edge cases', () => {
		expect(getMediaFileType('resource.ts')).toBeUndefined();
		expect(getMediaFileType('schema.graphql')).toBeUndefined();
		expect(getMediaFileType('README')).toBeUndefined();
		expect(getMediaFileType('')).toBeUndefined();
		expect(getMediaFileType(undefined)).toBeUndefined();
	});
});

describe('isMediaFile', () => {
	it('is true for media and false otherwise', () => {
		expect(isMediaFile('a.png')).toBe(true);
		expect(isMediaFile('a.mp4')).toBe(true);
		expect(isMediaFile('a.ts')).toBe(false);
		expect(isMediaFile(undefined)).toBe(false);
	});
});
