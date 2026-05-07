import { describe, expect, it } from 'vitest';
import { getSpecRequiredFields } from './specRequiredFields.ts';

describe('getSpecRequiredFields', () => {
	it('returns [] for an unknown metric', () => {
		expect(getSpecRequiredFields('not-a-metric')).toEqual([]);
	});

	it('includes series.field and groupBy dimension for a registered groupBy spec (db-read)', () => {
		// db-read groups by `path` (also its primaryDimension) and reads a
		// quantile field by default. The dimension is required (without it the
		// pipeline can't group); the active default field is required.
		const fields = getSpecRequiredFields('db-read');
		expect(fields).toContain('path');
	});

	it('surfaces `period` for any spec with a rate transform', () => {
		// bytes-sent runs a rate transform (count → count/sec via period). The
		// helper must include `period` even though the spec doesn't list it
		// as a field directly.
		const fields = getSpecRequiredFields('bytes-sent');
		expect(fields).toContain('period');
	});

	it('uses derived-metric overrides for metrics not in the spec registry', () => {
		const reqRate = getSpecRequiredFields('request-rate');
		expect(reqRate).toContain('count');
		expect(reqRate).toContain('period');

		const errRate = getSpecRequiredFields('error-rate');
		expect(errRate).toContain('count');
	});

	it('returns [] for a derived metric without an explicit override', () => {
		// mqtt-traffic-* delegate to runPipeline against the source spec, so
		// they tolerate drift via the source path; helper conservatively
		// returns no required fields for them.
		expect(getSpecRequiredFields('mqtt-traffic-sent')).toEqual([]);
	});

	it('does not flag the `node` dimension as a required field', () => {
		// `node` is part of AnalyticsDataPoint by contract; it is not a
		// schema-drift candidate. Specs grouping by node should not produce
		// `node` in the requiredFields list.
		const fields = getSpecRequiredFields('utilization');
		expect(fields).not.toContain('node');
	});

	// Anti-cases for the over-aggressive walker that blanked cpu-usage and
	// similar small-multiples specs: optional/alternate columns must NOT be
	// flagged as required because absence doesn't break the default render.

	it('does NOT flag the confidence field as required (greys cells, not blanks them)', () => {
		// replication-latency gates on `count`. Without count, cells render
		// ungated rather than blank — so it's not load-bearing for "render at
		// all".
		const fields = getSpecRequiredFields('replication-latency');
		expect(fields).not.toContain('count');
	});

	it('flags only the active quantile (the spec default), not every alternate', () => {
		// cpu-usage's quantileSelector exposes p1/p10/p25/median/p50/p75/p90/
		// p95/p99/p999 as alternates the user can switch to. Only `p95` (the
		// spec default) is required for the *initial* render — the rest are
		// optional drilldowns. Flagging all of them blanks a fine response
		// that only carries the default.
		const fields = getSpecRequiredFields('cpu-usage');
		const quantileAlts = fields.filter((f) => /^p\d+$/.test(f) || f === 'median');
		// Active default is p95; no other quantiles should be required.
		expect(quantileAlts).toEqual(['p95']);
	});

	it('flags `path` for cpu-usage because path is the groupBy dimension (load-bearing)', () => {
		// cpu-usage IS keyed by path: series.kind='groupBy', dimension='path'.
		// Without `path` the pipeline collapses every record into one bucket;
		// the chart genuinely cannot render. So this is a correct positive,
		// not a false-positive — the operator-reported failure mode is the
		// adapter flagging it on EMPTY responses, fixed at the adapter
		// layer (see useAnalyticsRecords schema-drift gate).
		expect(getSpecRequiredFields('cpu-usage')).toContain('path');
	});
});
