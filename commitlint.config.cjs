// A squash merge's header is the PR title (or a lone commit's header) plus the ` (#123)` GitHub
// appends. Measuring it without that suffix keeps one limit for what the author wrote, so a title
// that passes on its PR can't fail after it lands, where fixing it means rewriting a deploy branch.
const SQUASH_PR_SUFFIX = / \(#\d+\)$/;
const HEADER_MAX_LENGTH = 100;

module.exports = {
	extends: ['@commitlint/config-conventional'],
	plugins: [
		{
			rules: {
				'header-max-length-before-pr-number': (parsed, _when, value = HEADER_MAX_LENGTH) => {
					const header = (parsed.header ?? '').replace(SQUASH_PR_SUFFIX, '');
					return [
						header.length <= value,
						`header must not be longer than ${value} characters, not counting the " (#123)" a squash merge appends; current length is ${header.length}`,
					];
				},
			},
		},
	],
	rules: {
		'header-max-length': [0],
		'header-max-length-before-pr-number': [2, 'always', HEADER_MAX_LENGTH],
		'subject-case': [
			0,
			'never',
		],
		'body-max-line-length': [
			0,
			'never',
		],
		'footer-max-line-length': [
			0,
			'never',
		],
	},
};
