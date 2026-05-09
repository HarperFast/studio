import type { FieldExpr } from '../types/analytics.ts';

export function evalFieldExpr(
	expr: FieldExpr,
	record: Record<string, unknown>,
): number | null {
	switch (expr.kind) {
		case 'const':
			return expr.value;
		case 'ref': {
			const v = record[expr.field];
			return typeof v === 'number' && Number.isFinite(v) ? v : null;
		}
		case 'op': {
			const l = evalFieldExpr(expr.left, record);
			const r = evalFieldExpr(expr.right, record);
			if (l === null || r === null) { return null; }
			switch (expr.op) {
				case '+':
					return l + r;
				case '-':
					return l - r;
				case '*':
					return l * r;
				case '/':
					return r === 0 ? null : l / r;
				default: {
					const _exhaustive: never = expr.op;
					throw new Error(`unknown op: ${String(_exhaustive)}`);
				}
			}
		}
		default: {
			const _exhaustive: never = expr;
			throw new Error(`unknown FieldExpr kind: ${(_exhaustive as { kind: string }).kind}`);
		}
	}
}
