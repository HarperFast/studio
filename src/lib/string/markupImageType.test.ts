import { describe, expect, it } from 'vitest';
import { getMarkupImageType, isMarkupImageFile } from './markupImageType';

describe('getMarkupImageType', () => {
	it('classifies SVG with the correct MIME type', () => {
		expect(getMarkupImageType('icon.svg')).toEqual({ mime: 'image/svg+xml' });
	});

	it('is case-insensitive', () => {
		expect(getMarkupImageType('Logo.SVG')).toEqual({ mime: 'image/svg+xml' });
	});

	it('returns undefined for raster images and other files', () => {
		// Raster/binary images stay preview-only and must not be treated as markup.
		expect(getMarkupImageType('photo.png')).toBeUndefined();
		expect(getMarkupImageType('photo.jpg')).toBeUndefined();
		expect(getMarkupImageType('clip.mp4')).toBeUndefined();
		expect(getMarkupImageType('resource.ts')).toBeUndefined();
		expect(getMarkupImageType('README')).toBeUndefined();
		expect(getMarkupImageType('')).toBeUndefined();
		expect(getMarkupImageType(undefined)).toBeUndefined();
	});
});

describe('isMarkupImageFile', () => {
	it('is true for SVG and false otherwise', () => {
		expect(isMarkupImageFile('a.svg')).toBe(true);
		expect(isMarkupImageFile('a.png')).toBe(false);
		expect(isMarkupImageFile(undefined)).toBe(false);
	});
});
