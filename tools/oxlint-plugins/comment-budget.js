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
 */
const DIRECTIVE =
	/^\s*(?:eslint|oxlint|globals?\s|prettier-|dprint-|biome-|type-coverage:|[cv]8 ignore|istanbul ignore|jscs:|jshint |@ts-|@vite-|webpack|#__|@__|#?(?:end)?region\b|<\/?reference)/;

/** JSDoc/TSDoc — `/** … *␀/`, but not a `/*** … *␀/` banner or a bare `/* … *␀/`. */
function isDocComment(comment) {
	return comment.type === 'Block' && comment.value.startsWith('*') && !comment.value.startsWith('**');
}

/**
 * Collapse a comment list into sites. Consecutive lines of *own-line* comments are one wrapped
 * paragraph and are charged once. A trailing comment (code to its left) never merges, in either
 * direction: `a = 1; // why` followed by `b = 2; // why` is two separate asides that happen to be
 * neighbours, not one paragraph.
 */
function toSites(comments, isOwnLine) {
	const sites = [];
	for (const comment of comments) {
		const ownLine = isOwnLine(comment);
		const previous = sites.at(-1);
		if (ownLine && previous?.ownLine && comment.loc.start.line - previous.endLine <= 1) {
			previous.endLine = comment.loc.end.line;
		} else {
			sites.push({ first: comment, endLine: comment.loc.end.line, ownLine });
		}
	}
	return sites;
}

/** Of the candidate blocks containing `site`, the one that starts latest is the innermost. */
function innermostBlock(site, blocks, fallback) {
	const [start, end] = site.first.range;
	let innermost = fallback;
	for (const block of blocks) {
		if (block.range[0] <= start && end <= block.range[1] && block.range[0] >= innermost.range[0]) {
			innermost = block;
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

		/** True when nothing but indentation precedes the comment on its line. */
		function isOwnLine(comment) {
			for (let i = comment.range[0] - 1; i >= 0 && text[i] !== '\n' && text[i] !== '\r'; i--) {
				if (text[i] !== ' ' && text[i] !== '\t') { return false; }
			}
			return true;
		}

		return {
			'BlockStatement, StaticBlock, ClassBody, SwitchCase, TSModuleBlock'(node) {
				blocks.push(node);
			},

			'Program:exit'(program) {
				const counted = sourceCode.getAllComments().filter((comment) =>
					!DIRECTIVE.test(comment.value) && !(allowJSDoc && isDocComment(comment))
				);
				const sites = toSites(counted, isOwnLine);

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
					const block = innermostBlock(site, blocks, program);
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
