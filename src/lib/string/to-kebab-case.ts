/**
 * Converts a string to kebab-case.
 *
 * @param str - The string to convert
 * @returns The kebab-cased string
 *
 * @example
 * toKebabCase('Hello World') // 'hello-world'
 * toKebabCase('camelCase') // 'camel-case'
 * toKebabCase('PascalCase') // 'pascal-case'
 * toKebabCase('snake_case') // 'snake-case'
 * toKebabCase('with spaces and_underscores') // 'with-spaces-and-underscores'
 */
export function toKebabCase(str: string): string {
	return str
		// Replace any non-alphanumeric characters with hyphens
		.replace(/[^a-zA-Z0-9]/g, '-')
		// Insert a hyphen before any uppercase letter that follows a lowercase letter
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		// Convert to lowercase
		.toLowerCase()
		// Replace multiple consecutive hyphens with a single hyphen
		.replace(/-+/g, '-')
		// Remove leading and trailing hyphens
		.replace(/^-+|-+$/g, '');
}

// Easter egg: I know this file doesn't follow our convention (it should be toKebabCase.ts), but I thought it would
// be funny if it was itself in kebab-case
//   - <3 Dawson
