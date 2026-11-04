import { describe, expect, it } from 'vitest';
import { workflowPath, workflowsQueryString } from './workflowAdminApi';

describe('workflowsQueryString', () => {
	it('leaves unset filters out', () => {
		expect(workflowsQueryString({})).toBe('');
		expect(workflowsQueryString({ type: ' ', clusterId: '' })).toBe('');
	});

	it('sends active=true only when no single status is picked', () => {
		expect(workflowsQueryString({ active: true })).toBe('active=true');
		expect(workflowsQueryString({ active: true, status: 'PAUSED' })).toBe('status=PAUSED');
	});

	it('trims and passes type and cluster', () => {
		expect(workflowsQueryString({ type: 'UPDATE_HARPER_VERSION', clusterId: ' clu-1 ' })).toBe(
			'type=UPDATE_HARPER_VERSION&clusterId=clu-1',
		);
	});
});

describe('workflowPath', () => {
	it('keeps a child id’s slashes literal, since central manager splits on them', () => {
		expect(workflowPath('wf-1/batch/b1/child')).toBe('/Admin/Workflow/wf-1/batch/b1/child');
	});

	it('encodes each segment', () => {
		expect(workflowPath('wf-1/a b?')).toBe('/Admin/Workflow/wf-1/a%20b%3F');
	});
});
