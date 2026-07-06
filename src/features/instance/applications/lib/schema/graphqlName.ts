/**
 * A `schema.graphql` type or field name must be a valid GraphQL Name — a letter
 * or underscore followed by letters, digits, or underscores. That's stricter
 * than Harper's general table-name rule (`schemaRegex`, which only forbids
 * backticks and slashes and is used for arbitrary database table names). The
 * visual editor validates against this so names that would produce invalid SDL
 * (spaces, leading digits, punctuation) are flagged.
 */
const GRAPHQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;

export function isValidGraphqlName(name: string): boolean {
	return GRAPHQL_NAME.test(name);
}

export const GRAPHQL_NAME_HINT = 'Use letters, numbers, and underscores, and don’t start with a number.';
