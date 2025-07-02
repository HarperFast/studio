import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
import jsxA11Y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-plugin-prettier';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all,
});

export default [
	...fixupConfigRules(compat.extends('react-app', 'airbnb', 'plugin:jsx-a11y/recommended', 'prettier')),
	{
		// root: true,
		plugins: {
			'jsx-a11y': fixupPluginRules(jsxA11Y),
			prettier,
		},

		rules: {
			'camelcase': 0,
			'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
			'no-nested-ternary': 0,
			'no-param-reassign': 0,
			'no-return-assign': 0,
			'no-restricted-syntax': 0,
			'react/jsx-filename-extension': 0,
			'react/jsx-props-no-spreading': 0,
			'react/destructuring-assignment': 0,
			'react/prop-types': 0,
			'react/no-danger': 0,
			'no-unused-vars': 1,
			'react/button-has-type': 1,
			'import/no-named-as-default': 0,
			'import/no-named-as-default-member': 0,
			'no-underscore-dangle': [
				'warn',
				{
					allow: ['_kmq', '_kmk'],
				},
			],
			'no-unsafe-optional-chaining': 0,
			'jsx-a11y/label-has-associated-control': 0,
			'react/jsx-no-bind': 0,

			'react/no-unstable-nested-components': [
				'warn',
				{
					allowAsProps: true,
				},
			],
		},
	},
];
