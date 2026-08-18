/**
 * A comment budget, not a comment ban.
 *
 * The rule counts *sites* — one run of adjacent comment lines is one site, however long — so a
 * single considered explanation costs the same as a single `// increment i`. That is deliberate:
 * budgeting per line would make the thoughtful six-line note more expensive than six scattered
 * throwaways, which is backwards. When a block runs out of budget the fix is almost always to
 * extract a named function, and when a file does it is usually to split it.
 *
 * Written to the ESLint v9 rule API so it runs under both oxlint (`jsPlugins`) and ESLint.
 */

/**
 * Comments that carry no prose and cannot be replaced by better naming: linter and compiler
 * directives, formatter pragmas, coverage markers, bundler hints, and editor fold markers.
 * These never count against a budget — a budget that eats the escape hatches trains people to
 * disable the budget.
 *
 * Matched against `comment.value`, i.e. the text with the opening `//` or `/*` already stripped.
 * That is why the TypeScript triple-slash forms are written with a leading `\/`: by the time the
 * rule sees `/// <reference types="…" />`, two of the three slashes are gone and the value begins
 * `/ <reference`.
 *
 * This is an allowlist of the exact recognised forms, not a list of tool-name prefixes. Prefixes
 * leak: `eslint-` also matches `// eslint-based behavior differs here`, and every one of the ten
 * prefixes this replaced had a near-miss like it, each buying a comment a free exemption. `global`,
 * `jshint`, and `jscs` are omitted entirely — their valid forms are indistinguishable from prose.
 *
 * Each fixed form ends in `(?=\s|$)` rather than `\b`, because `\b` also succeeds before a hyphen:
 * `prettier-ignore\b` matches `// prettier-ignore-this explanation`. Every one of the ten `\b`
 * forms had that leak too.
 */
const DIRECTIVE = new RegExp(`^\\s*(?:${
	[
		String.raw`(?:es|ox)lint-(?:disable|enable)(?:-next-line|-line)?(?=\s|$)`,
		String.raw`eslint-env(?=\s|$)`,
		String.raw`(?:es|ox)lint\s+[\w@/$-]+\s*:`,
		String.raw`prettier-ignore(?=\s|$)`,
		String.raw`dprint-ignore(?:-start|-end|-file)?(?=\s|$)`,
		String.raw`biome-ignore(?=\s|$)`,
		String.raw`@ts-(?:ignore|expect-error|nocheck|check)(?=\s|$)`,
		String.raw`@vite-ignore(?=\s|$)`,
		String.raw`type-coverage:ignore-(?:next-line|line|file)(?=\s|$)`,
		String.raw`[cv]8 ignore(?=\s|$)`,
		String.raw`istanbul ignore(?=\s|$)`,
		String.raw`webpack(?:ChunkName|Mode|Prefetch|Preload|Include|Exclude|Ignore|Exports|FetchPriority)\s*:`,
		String.raw`[#@]__(?:PURE|NO_SIDE_EFFECTS)__(?=\s|$)`,
		String.raw`#(?:end)?region(?:\s|$)`,
		String.raw`/\s*<(?:reference|amd-)`,
	].join('|')
})`);

/** JSDoc/TSDoc — `/** … *␀/`, but not a `/*** … *␀/` banner or a bare `/* … *␀/`. */
function isDocComment(comment) {
	return comment.type === 'Block' && comment.value.startsWith('*') && !comment.value.startsWith('**');
}

/**
 * Collapse a comment list into sites.
 *
 * Consecutive lines of *own-line* comments are one wrapped paragraph and are charged once. A
 * trailing comment (code to its left) never merges with a neighbour: `a = 1; // why` followed by
 * `b = 2; // why` is two separate asides, not one paragraph.
 *
 * The exception is a trailing comment annotating an element of a data literal —
 * `'org-', // empty body` in a table of test cases. That describes the row it sits on rather than
 * the logic around it, and no amount of renaming can absorb it, so the whole annotated literal is
 * charged once however many rows carry a note; otherwise documenting fixture data would be the most
 * expensive thing in the codebase.
 */
function toSites(comments, isOwnLine, annotatedLiteralFor) {
	const sites = [];
	const literalSites = new Map();

	for (const comment of comments) {
		const ownLine = isOwnLine(comment);
		const literal = ownLine ? undefined : annotatedLiteralFor(comment);

		if (literal) {
			const opened = literalSites.get(literal);
			if (opened) {
				opened.endLine = comment.loc.end.line;
			} else {
				const site = { first: comment, endLine: comment.loc.end.line, ownLine };
				literalSites.set(literal, site);
				sites.push(site);
			}
			continue;
		}

		const previous = sites.at(-1);
		if (ownLine && previous?.ownLine && comment.loc.start.line - previous.endLine <= 1) {
			previous.endLine = comment.loc.end.line;
		} else {
			sites.push({ first: comment, endLine: comment.loc.end.line, ownLine });
		}
	}

	return sites;
}

function innermostEnclosing([start, end], nodes) {
	let innermost;
	for (const node of nodes) {
		const encloses = node.range[0] <= start && end <= node.range[1];
		if (encloses && (!innermost || node.range[0] >= innermost.range[0])) {
			innermost = node;
		}
	}
	return innermost;
}

/** @type {import('eslint').Rule.RuleModule} */
const commentBudget = {
	meta: {
		type: 'suggestion',
		docs: {
			description: 'Cap how many separate comment sites a file or a single block may carry',
		},
		schema: [{
			type: 'object',
			properties: {
				maxPerFile: { type: 'integer', minimum: 0 },
				maxPerBlock: { type: 'integer', minimum: 0 },
				allowJSDoc: { type: 'boolean' },
			},
			additionalProperties: false,
		}],
		messages: {
			file:
				'This file has {{count}} comments; the budget is {{max}}. Prefer names that carry the meaning, or split the file.',
			block:
				'This block has {{count}} comments; the budget is {{max}}. Extracting a named function usually beats explaining in place.',
		},
	},

	create(context) {
		const { maxPerFile = 10, maxPerBlock = 2, allowJSDoc = true } = context.options[0] ?? {};
		const sourceCode = context.sourceCode ?? context.getSourceCode();
		const text = sourceCode.getText();
		const blocks = [];
		const dataLiterals = [];

		function isOwnLine(comment) {
			for (let i = comment.range[0] - 1; i >= 0 && text[i] !== '\n' && text[i] !== '\r'; i--) {
				if (text[i] !== ' ' && text[i] !== '\t') { return false; }
			}
			return true;
		}

		function annotatedLiteralFor(comment) {
			const literal = innermostEnclosing(comment.range, dataLiterals);
			if (!literal) { return undefined; }

			// A comment inside a block that is itself nested in the literal — an object method body —
			// annotates logic that merely lives in a literal, not a row of data. Without this the
			// whole method collapses to one site and its block budget stops applying.
			const block = innermostEnclosing(comment.range, blocks);
			return block && block.range[0] > literal.range[0] ? undefined : literal;
		}

		return {
			'BlockStatement, StaticBlock, ClassBody, SwitchCase, TSModuleBlock'(node) {
				blocks.push(node);
			},

			'ArrayExpression, ObjectExpression, TSTupleType, TSTypeLiteral, TSEnumBody'(node) {
				dataLiterals.push(node);
			},

			'Program:exit'(program) {
				const counted = sourceCode.getAllComments().filter((comment) =>
					!DIRECTIVE.test(comment.value) && !(allowJSDoc && isDocComment(comment))
				);
				const sites = toSites(counted, isOwnLine, annotatedLiteralFor);

				// One report per scope, on the site that broke the budget, so a file that is far over
				// gets a single actionable warning instead of a wall of them.
				if (sites.length > maxPerFile) {
					context.report({
						node: sites[maxPerFile].first,
						messageId: 'file',
						data: { count: String(sites.length), max: String(maxPerFile) },
					});
				}

				const byBlock = new Map();
				for (const site of sites) {
					const block = innermostEnclosing(site.first.range, blocks) ?? program;
					if (block === program) { continue; }
					const blockSites = byBlock.get(block);
					if (blockSites) {
						blockSites.push(site);
					} else {
						byBlock.set(block, [site]);
					}
				}
				for (const blockSites of byBlock.values()) {
					if (blockSites.length > maxPerBlock) {
						context.report({
							node: blockSites[maxPerBlock].first,
							messageId: 'block',
							data: { count: String(blockSites.length), max: String(maxPerBlock) },
						});
					}
				}
			},
		};
	},
};

export default {
	meta: { name: 'comment-budget' },
	rules: { 'comment-budget': commentBudget },
};
