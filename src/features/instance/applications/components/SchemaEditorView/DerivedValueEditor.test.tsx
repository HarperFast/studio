/** @vitest-environment jsdom */
import { decideValues } from '@/features/instance/applications/lib/schema/derivedFields';
import { getArgValue, hasDirective } from '@/features/instance/applications/lib/schema/mutations';
import { parseSchema } from '@/features/instance/applications/lib/schema/parseSchema';
import { FieldModel, TableModel } from '@/features/instance/applications/lib/schema/types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DerivedValueEditor } from './DerivedValueEditor';

afterEach(cleanup);

function tableOf(fields: string): TableModel {
	const source = `type Ticket @table {\n\tid: ID @primaryKey\n\tbody: String\n\ttitle: String\n${fields}\n}\n`;
	const segment = parseSchema(source).document.segments.find((s) => s.kind === 'table');
	if (segment?.kind !== 'table') {
		throw new Error('no table');
	}
	return segment.table;
}

const MODELS = { embedding: ['default', 'multimodal'], decision: ['default', 'route'] };

function show(
	fields: string,
	name: string,
	props: Partial<Parameters<typeof DerivedValueEditor>[0]> = {},
) {
	const table = tableOf(fields);
	const onChange = vi.fn<(field: FieldModel) => void>();
	function Harness() {
		const [current, setCurrent] = useState(table);
		const field = current.fields.find((candidate) => candidate.name === name)!;
		return (
			<DerivedValueEditor
				field={field}
				table={current}
				models={MODELS}
				harperVersion="5.3.6"
				readOnly={false}
				onChange={(next) => {
					onChange(next);
					setCurrent({ ...current, fields: current.fields.map((f) => (f.name === name ? next : f)) });
				}}
				{...props}
			/>
		);
	}
	const { container } = render(<Harness />);
	return { onChange, container, last: () => onChange.mock.calls.at(-1)![0] };
}

function choose(label: string, value: string) {
	fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function options(label: string): string[] {
	return [...(screen.getByLabelText(label) as HTMLSelectElement).options].map((option) => option.textContent ?? '');
}

describe('where the controls appear', () => {
	it('offers @embed on a [Float] field and @decide on a String, Boolean or Int field', () => {
		show('\tvector: [Float]', 'vector');
		expect(screen.getByLabelText(/Embed another field/)).toBeTruthy();
		expect(screen.queryByLabelText(/Decide from another field/)).toBeNull();
		cleanup();
		show('\tlabel: String', 'label');
		expect(screen.getByLabelText(/Decide from another field/)).toBeTruthy();
		expect(screen.queryByLabelText(/Embed another field/)).toBeNull();
	});

	it('shows nothing on a field that can carry neither', () => {
		expect(show('\twhen: Date', 'when').container.innerHTML).toBe('');
		cleanup();
		expect(show('\tscores: [Int]', 'scores').container.innerHTML).toBe('');
	});

	it('offers each only from the release that has it, and nothing when the version is unknown', () => {
		show('\tlabel: String', 'label', { harperVersion: '5.2.15' });
		expect(screen.queryByLabelText(/Decide from another field/)).toBeNull();
		cleanup();
		show('\tvector: [Float]', 'vector', { harperVersion: '5.2.15' });
		expect(screen.getByLabelText(/Embed another field/)).toBeTruthy();
		cleanup();
		show('\tvector: [Float]', 'vector', { harperVersion: '5.0.4' });
		expect(screen.queryByLabelText(/Embed another field/)).toBeNull();
		cleanup();
		expect(show('\tvector: [Float]', 'vector', { harperVersion: undefined }).container.innerHTML).toBe('');
	});

	it('still shows a directive that is already there, so a misplaced one can be seen and removed', () => {
		const { last } = show('\tlabel: Date @decide(source: "body")', 'label', { harperVersion: '5.2.15' });
		expect(screen.getByText("@decide needs a String, Boolean or Int field that isn't an array.")).toBeTruthy();
		fireEvent.click(screen.getByLabelText(/Decide from another field/));
		expect(hasDirective(last().directives, 'decide')).toBe(false);
	});
});

describe('@embed', () => {
	it('turns on with nothing chosen, and says what is still needed', () => {
		const { last } = show('\tvector: [Float]', 'vector');
		fireEvent.click(screen.getByLabelText(/Embed another field/));
		expect(hasDirective(last().directives, 'embed')).toBe(true);
		expect(screen.getByText('Choose the field to embed.')).toBeTruthy();
		expect(screen.getByText('Choose the embedding model.')).toBeTruthy();
	});

	it("chooses the source among the table's other fields and the model among the instance's", () => {
		const { last } = show('\tvector: [Float] @embed', 'vector');
		expect(options('Field to embed')).toEqual(['Choose a field', 'id', 'body', 'title']);
		expect(options('Embedding model')).toEqual(['Choose a model', 'default', 'multimodal']);
		choose('Field to embed', 'body');
		choose('Embedding model', 'multimodal');
		expect(getArgValue(last().directives, 'embed', 'source')).toBe('"body"');
		expect(getArgValue(last().directives, 'embed', 'model')).toBe('"multimodal"');
		expect(screen.queryByText(/Choose the/)).toBeNull();
	});

	it('keeps a model the instance does not have selected, and says so', () => {
		show('\tvector: [Float] @embed(source: "body", model: "gone")', 'vector');
		expect((screen.getByLabelText('Embedding model') as HTMLSelectElement).value).toBe('gone');
		expect(options('Embedding model')).toContain('gone (not a model on this instance)');
	});

	it('says when the instance has no embedding model to choose', () => {
		show('\tvector: [Float] @embed', 'vector', { models: { embedding: [], decision: [] } });
		expect(screen.getByText('This instance has none yet. Add one under Config, AI Models.')).toBeTruthy();
	});

	it("takes a typed model name when Studio couldn't read the instance's models", () => {
		const { last } = show('\tvector: [Float] @embed(source: "body")', 'vector', { models: undefined });
		const input = screen.getByLabelText('Embedding model') as HTMLInputElement;
		expect(input.tagName).toBe('INPUT');
		fireEvent.change(input, { target: { value: 'default' } });
		expect(getArgValue(last().directives, 'embed', 'model')).toBe('"default"');
	});

	it('explains what Harper does with the field', () => {
		show('\tvector: [Float] @embed(source: "body", model: "default")', 'vector');
		expect(screen.getByText(/whenever a record is written, and indexes it for vector search/)).toBeTruthy();
	});
});

describe('@decide', () => {
	it('says the write fails when the model cannot decide', () => {
		show('\tflag: Boolean @decide(source: "body")', 'flag');
		expect(screen.getByText(/If the model can't decide, the write fails\./)).toBeTruthy();
	});

	it('leaves the model unset for default, and offers the other decision models', () => {
		const { last } = show('\tflag: Boolean @decide(source: "body")', 'flag');
		expect(options('Decision model')).toEqual(['default', 'route']);
		choose('Decision model', 'route');
		expect(getArgValue(last().directives, 'decide', 'model')).toBe('"route"');
		choose('Decision model', '');
		expect(getArgValue(last().directives, 'decide', 'model')).toBeUndefined();
	});

	it('says when the default it would use is not a model on the instance', () => {
		show('\tflag: Boolean @decide(source: "body")', 'flag', { models: { embedding: [], decision: ['route'] } });
		expect(options('Decision model')).toEqual(['default (not a model on this instance)', 'route']);
	});

	it('takes the values of a String field one per line, commas and all', () => {
		const { last } = show('\tlabel: String @decide(source: "body")', 'label');
		expect(screen.getByText('List the values the model can choose from.')).toBeTruthy();
		const box = screen.getByLabelText('Values to choose from, one per line') as HTMLTextAreaElement;
		fireEvent.change(box, { target: { value: 'billing\n  refund, or credit \n' } });
		expect(decideValues(last().directives)).toEqual(['billing', 'refund, or credit']);
		expect(box.value).toBe('billing\n  refund, or credit \n');
		expect(screen.queryByText(/values/i, { selector: 'li' })).toBeNull();
	});

	it('shows values it cannot rewrite as written, for editing as text', () => {
		show('\tlabel: String @decide(source: "body", values: [1, 2])', 'label');
		expect(screen.queryByLabelText('Values to choose from, one per line')).toBeNull();
		expect(screen.getByText('[1, 2]')).toBeTruthy();
	});

	it('takes a minimum and maximum on an Int field', () => {
		const { last } = show('\tpriority: Int @decide(source: "body")', 'priority');
		fireEvent.change(screen.getByLabelText('Minimum'), { target: { value: '1' } });
		fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '5' } });
		expect(getArgValue(last().directives, 'decide', 'minimum')).toBe('1');
		expect(getArgValue(last().directives, 'decide', 'maximum')).toBe('5');
		expect(screen.queryByText(/minimum and a maximum/)).toBeNull();
		expect(screen.queryByLabelText('Values to choose from, one per line')).toBeNull();
	});

	it('asks a Boolean field for neither values nor a range', () => {
		show('\tflag: Boolean @decide(source: "body")', 'flag');
		expect(screen.queryByLabelText('Minimum')).toBeNull();
		expect(screen.queryByLabelText('Values to choose from, one per line')).toBeNull();
	});

	it('keeps the arguments it has no input for, and names them', () => {
		const { last } = show(
			'\tscore: Float\n\twhy: String\n\tflag: Boolean @decide(source: "body", confidence: "score", decision: "why")',
			'flag',
		);
		expect(screen.getByText(/Also set, and kept as written: confidence, decision\./)).toBeTruthy();
		fireEvent.change(screen.getByLabelText('Instructions for the model (optional)'), {
			target: { value: 'Be strict.' },
		});
		expect(getArgValue(last().directives, 'decide', 'instructions')).toBe('"Be strict."');
		expect(getArgValue(last().directives, 'decide', 'confidence')).toBe('"score"');
		expect(getArgValue(last().directives, 'decide', 'decision')).toBe('"why"');
	});

	it('shows values that one per line cannot hold as written: an end space, an empty value, a line break', () => {
		for (const values of ['["a ", "b"]', '["a", ""]', '["a\\nb", "c"]']) {
			show(`\tlabel: String @decide(source: "body", values: ${values})`, 'label');
			expect(screen.queryByLabelText('Values to choose from, one per line')).toBeNull();
			expect(screen.getByText(values)).toBeTruthy();
			cleanup();
		}
	});

	it('reads a block string the way Harper does', () => {
		show('\tflag: Boolean @decide(source: """body""", instructions: """\n\t\tBe strict.\n\t""")', 'flag');
		expect((screen.getByLabelText('Field to decide from') as HTMLSelectElement).value).toBe('body');
		expect((screen.getByLabelText('Instructions for the model (optional)') as HTMLInputElement).value).toBe(
			'Be strict.',
		);
		expect(screen.queryByRole('listitem')).toBeNull();
	});

	it('reads a model written as "default" as the unset choice, not as a missing model', () => {
		show('\tflag: Boolean @decide(source: "body", model: "default")', 'flag');
		expect(options('Decision model')).toEqual(['default', 'route']);
		expect((screen.getByLabelText('Decision model') as HTMLSelectElement).value).toBe('');
	});

	it('offers to remove the arguments an earlier field type left behind, keeping the rest', () => {
		const { last } = show(
			'\tpriority: Int @decide(source: "body", values: ["a", "b"], minimum: 1, maximum: 5)',
			'priority',
		);
		fireEvent.click(screen.getByRole('button', { name: 'Remove values' }));
		expect(getArgValue(last().directives, 'decide', 'values')).toBeUndefined();
		expect(getArgValue(last().directives, 'decide', 'source')).toBe('"body"');
		expect(getArgValue(last().directives, 'decide', 'minimum')).toBe('1');
		expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
		cleanup();
		show('\tflag: Boolean @decide(source: "body", minimum: 1, maximum: 5)', 'flag');
		expect(screen.getByRole('button', { name: 'Remove minimum, maximum' })).toBeTruthy();
	});
});

it('locks every control on a read-only schema', () => {
	show('\tlabel: String @decide(source: "body", values: ["a", "b"])', 'label', { readOnly: true });
	const controls = [
		screen.getByLabelText(/Decide from another field/),
		screen.getByLabelText('Field to decide from'),
		screen.getByLabelText('Decision model'),
		screen.getByLabelText('Values to choose from, one per line'),
		screen.getByLabelText('Instructions for the model (optional)'),
	] as HTMLInputElement[];
	expect(controls.every((control) => control.disabled)).toBe(true);
});
