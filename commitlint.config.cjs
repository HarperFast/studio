// A squash merge's header is the PR title (or a lone commit's header) plus the ` (#123)` GitHub
// appends. Measuring it without every trailing ` (#N)` gives a header the same verdict before and
// after that suffix, so nothing that passes on its PR can fail after it lands, where fixing it
// means rewriting a deploy branch. Stripping only the last one would not: `… (#2014)` would lose
// its own reference on the PR and keep it once squashed.
const TRAILING_REFERENCES = /(?: \(#\d+\))+$/;
const HEADER_MAX_LENGTH = 100;

module.exports = {
	extends: ['@commitlint/config-conventional'],
	plugins: [
		{
			rules: {
				'header-max-length-before-pr-number': (parsed, _when, value = HEADER_MAX_LENGTH) => {
					const header = (parsed.header ?? '').replace(TRAILING_REFERENCES, '');
					return [
						header.length <= value,
						`header must not be longer than ${value} characters, not counting trailing " (#123)" references such as the one a squash merge appends; current length is ${header.length}`,
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
