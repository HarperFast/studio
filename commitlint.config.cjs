module.exports = {
	extends: ['@commitlint/config-conventional'],
	rules: {
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
