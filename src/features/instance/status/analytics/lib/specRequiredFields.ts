import { derivedRegistry } from '../pipeline/derived/index';
import { specRegistry } from '../pipeline/index';
import type { FieldExpr, FieldSpec, MetricSpec, Transform } from '../types/analytics';

/** Per-derived-metric required-field overrides. Derived specs read raw
 *  source-metric columns directly (their `recompute` doesn't go through
 *  runPipeline), so a generic spec walker can't infer them. The keys here
 *  are derived metric ids (matching `derivedRegistry` keys); values are
 *  the source-record fields the recompute reads. */
const DERIVED_REQUIRED_FIELDS: Record<string, readonly string[]> = {
	'request-rate': ['count', 'period'],
	'error-rate': ['count', 'total'],
	// mqtt-traffic-* delegate to runPipeline against bytes-{sent,received}
	// inner specs, so they are covered transitively through the source spec
	// and the renderer fetches the source metric directly.
};

/** Walks a MetricSpec and returns the union of Harper field names the
 *  pipeline must read to render the *default* view. Used by panel
 *  renderers to feed `useAnalyticsRecords({ requiredFields })` so a Harper
 *  response missing a load-bearing column surfaces an explicit "field
 *  unavailable" empty state instead of a blank chart.
 *
 *  The bar for "required" is intentionally tight: only the fields that
 *  must be present for the panel's *initial* render to produce data.
 *  Optional drilldowns (quantile alternates the user can pick), labels
 *  used purely for grouping, and primary/sub-dimension metadata are
 *  excluded — surfacing them as "missing" produces false positives that
 *  blank an otherwise-fine chart (we hit this with cpu-usage, which has a
 *  quantile picker but ships zero quantile fields by default). */
const requiredFieldsCache = new Map<string, readonly string[]>();

export function getSpecRequiredFields(metric: string): readonly string[] {
	let fields = requiredFieldsCache.get(metric);
	if (!fields) {
		fields = computeRequiredFields(metric);
		requiredFieldsCache.set(metric, fields);
	}
	return fields;
}

/** Results are deterministic per metric (the registries are static module
 *  state), so cache them — panels call this every render and a fresh array
 *  identity would churn downstream memos. */

function computeRequiredFields(metric: string): readonly string[] {
	const override = DERIVED_REQUIRED_FIELDS[metric];
	if (override) { return override; }
	const derived = derivedRegistry[metric];
	if (derived) {
		// Unknown derived without an override: conservative default — require
		// nothing rather than mis-flag missingFields.
		return [];
	}
	const entry = specRegistry[metric];
	if (!entry?.spec) { return []; }
	return collectFromSpec(entry.spec);
}

function collectFromSpec(spec: MetricSpec): string[] {
	const fields = new Set<string>();
	const series = spec.series;
	let referencesRate = false;

	if (series.kind === 'field') {
		for (const f of series.fields) {
			collectFromFieldSpec(f, fields);
			if (transformReferencesRate(f.transform)) { referencesRate = true; }
		}
	} else {
		// groupBy: only the active series.field is required for the chart to
		// render. The dimension column is also required because the pipeline's
		// group step reads it; without it every record collapses into a
		// single bucket.
		collectFromFieldSpec(series.field, fields);
		if (transformReferencesRate(series.field.transform)) { referencesRate = true; }
		// `dimension: 'node'` is structural — it's read off
		// AnalyticsDataPoint.node which is part of the contract, not a
		// schema-drift candidate. Other dimensions (path, type, table,
		// database, method) are real Harper columns that can drift.
		if (series.dimension && series.dimension !== 'node') {
			fields.add(series.dimension);
		}
	}

	// `period` is read for `transform: rate` and for period-snapping. Spec
	// authors don't list it explicitly; derive it from rate references.
	if (referencesRate) { fields.add('period'); }

	// NOT required and intentionally excluded:
	//   - `count` (confidence gating): greys low-count cells but a record
	//     without it just renders ungated, not blank.
	//   - `spec.primaryDimension` / `spec.subDimension`: documentation /
	//     subgroup labels, not always read by the rendering path. Including
	//     them mis-flags specs whose visible field is something else (we hit
	//     this with cpu-usage where primaryDimension='path' but the panel
	//     reads user/harper percentages).
	//   - `spec.quantileSelector.fields`: alternates the user CAN pick. Only
	//     the active one matters at any time; flagging all 9–11 alternates
	//     blanks a perfectly fine default-render whenever a quantile column
	//     is sparsely populated.

	return [...fields];
}

function transformReferencesRate(t: Transform | undefined): boolean {
	if (!t) { return false; }
	switch (t.kind) {
		case 'rate':
			return true;
		case 'compose':
			return t.steps.some(transformReferencesRate);
		default:
			return false;
	}
}

function collectFromFieldSpec(f: FieldSpec, out: Set<string>) {
	collectFromExpr(f.field, out);
}

function collectFromExpr(expr: string | FieldExpr, out: Set<string>) {
	if (typeof expr === 'string') {
		out.add(expr);
		return;
	}
	switch (expr.kind) {
		case 'ref':
			out.add(expr.field);
			return;
		case 'const':
			return;
		case 'op':
			collectFromExpr(expr.left, out);
			collectFromExpr(expr.right, out);
			return;
	}
}
