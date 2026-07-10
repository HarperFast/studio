import { describe, expect, it } from 'vitest';
import { buildSecretAccessExample, isJsIdentifier, SECRET_NAME_PLACEHOLDER } from './accessExample';

describe('isJsIdentifier', () => {
	it('accepts bare identifiers', () => {
		expect(isJsIdentifier('MY_KEY')).toBe(true);
		expect(isJsIdentifier('_private')).toBe(true);
		expect(isJsIdentifier('$ref')).toBe(true);
		expect(isJsIdentifier('token2')).toBe(true);
	});

	it('rejects names that need bracket access', () => {
		expect(isJsIdentifier('my.key')).toBe(false); // dot
		expect(isJsIdentifier('my-key')).toBe(false); // dash
		expect(isJsIdentifier('2fa')).toBe(false); // leading digit
		expect(isJsIdentifier('')).toBe(false);
	});
});

describe('buildSecretAccessExample', () => {
	it('processEnv uses process.env dot access for identifier names', () => {
		const code = buildSecretAccessExample('API_KEY', 'processEnv');
		expect(code).toContain('const value = process.env.API_KEY;');
		expect(code).toContain('process.env for every component');
		expect(code).not.toContain('import { secrets }');
	});

	it('processEnv uses bracket access for non-identifier names', () => {
		expect(buildSecretAccessExample('my.key', 'processEnv')).toContain("const value = process.env['my.key'];");
		expect(buildSecretAccessExample('my-key', 'processEnv')).toContain("const value = process.env['my-key'];");
	});

	it('scoped destructures the secrets accessor for identifier names', () => {
		const code = buildSecretAccessExample('DB_PASSWORD', 'scoped');
		expect(code).toContain("import { secrets } from 'harper';");
		expect(code).toContain('const { DB_PASSWORD } = secrets;');
		expect(code).toContain('top level'); // the module-top-level guidance
		expect(code).not.toContain('process.env');
	});

	it('scoped uses bracket access for non-identifier names', () => {
		const code = buildSecretAccessExample('my.key', 'scoped');
		expect(code).toContain("const value = secrets['my.key'];");
		expect(code).not.toContain('const { my.key }');
	});

	it('falls back to a placeholder name when empty or whitespace', () => {
		expect(buildSecretAccessExample('', 'scoped')).toContain(`const { ${SECRET_NAME_PLACEHOLDER} } = secrets;`);
		expect(buildSecretAccessExample('   ', 'processEnv')).toContain(`process.env.${SECRET_NAME_PLACEHOLDER}`);
	});

	it('escapes single quotes in bracketed names', () => {
		expect(buildSecretAccessExample("a'b", 'processEnv')).toContain("process.env['a\\'b']");
	});
});
