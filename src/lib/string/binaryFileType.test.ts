import { describe, expect, it } from 'vitest';
import { isBinaryFile } from './binaryFileType';

describe('isBinaryFile', () => {
	it('treats compressed archives as binary', () => {
		expect(isBinaryFile('component.tgz')).toBe(true);
		expect(isBinaryFile('archive.tar.gz')).toBe(true);
		expect(isBinaryFile('bundle.tar')).toBe(true);
		expect(isBinaryFile('release.zip')).toBe(true);
		expect(isBinaryFile('data.gz')).toBe(true);
		expect(isBinaryFile('logs.bz2')).toBe(true);
		expect(isBinaryFile('image.xz')).toBe(true);
		expect(isBinaryFile('snapshot.zst')).toBe(true);
	});

	it('treats other compiled/binary formats as binary', () => {
		expect(isBinaryFile('addon.node')).toBe(true);
		expect(isBinaryFile('module.wasm')).toBe(true);
		expect(isBinaryFile('font.woff2')).toBe(true);
		expect(isBinaryFile('clip.mp3')).toBe(true);
		expect(isBinaryFile('doc.pdf')).toBe(true);
		expect(isBinaryFile('store.sqlite')).toBe(true);
	});

	it('is case-insensitive', () => {
		expect(isBinaryFile('COMPONENT.TGZ')).toBe(true);
		expect(isBinaryFile('Release.Zip')).toBe(true);
	});

	it('does not flag editable text/code files', () => {
		expect(isBinaryFile('index.ts')).toBe(false);
		expect(isBinaryFile('schema.graphql')).toBe(false);
		expect(isBinaryFile('config.yaml')).toBe(false);
		expect(isBinaryFile('README.md')).toBe(false);
		expect(isBinaryFile('package.json')).toBe(false);
		expect(isBinaryFile('Dockerfile')).toBe(false);
		expect(isBinaryFile('LICENSE')).toBe(false);
	});

	it('does not flag previewable media (handled as media, not binary)', () => {
		expect(isBinaryFile('logo.png')).toBe(false);
		expect(isBinaryFile('demo.mp4')).toBe(false);
		expect(isBinaryFile('icon.svg')).toBe(false);
	});

	it('returns false for empty and undefined input', () => {
		expect(isBinaryFile('')).toBe(false);
		expect(isBinaryFile(undefined)).toBe(false);
	});
});
