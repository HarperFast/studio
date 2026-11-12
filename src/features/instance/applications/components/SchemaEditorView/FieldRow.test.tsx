/** @vitest-environment jsdom */
import { nativeSelectStub } from '@/components/ui/__tests__/nativeSelectStub';
import { readFullTextConfig } from '@/features/instance/applications/lib/schema/fullText';
import { getArgValue } from '@/features/instance/applications/lib/schema/mutations';
import { parseSchema } from '@/features/instance/applications/lib/schema/parseSchema';
import { FieldModel, TableModel } from '@/features/instance/applications/lib/schema/types';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FieldRow } from './FieldRow';

vi.mock('@/components/ui/select', () => nativeSelectStub);

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => {};
	Element.prototype.releasePointerCapture ??= () => {};
	Element.prototype.scrollIntoView ??= () => {};
	// @ts-expect-error jsdom lacks PointerEvent; MouseEvent carries the fields Radix reads.
	window.PointerEvent ??= class extends MouseEvent {};
});

afterEach(cleanup);

function tableOf(source: string): TableModel {
	const segment = parseSchema(source).document.segments.find(s => s.kind === 'table');
	if (segment?.kind !== 'table') {
		throw new Error('no table');
	}
	return segment.table;
}

const PRODUCT = tableOf(`type Product @table(audit: true) {
	id: ID @primaryKey
	title: String
	description: String
	tags: [String]
	manual: Blob
	price: Float
	catalogSearch: FullText @fullText(fields: [{ name: "title", weight: 3 }, { name: "description" }])
}`);

function fieldOf(table: TableModel, name: string): FieldModel {
	return table.fields.find(field => field.name === name)!;
}

function renderRow(overrides: Partial<Parameters<typeof FieldRow>[0]> = {}) {
	const onChange = vi.fn<(field: FieldModel) => void>();
	const onEnableAudit = vi.fn();
	render(
		<FieldRow
			field={fieldOf(PRODUCT, 'catalogSearch')}
			table={PRODUCT}
			typeNames={['Product']}
			harperVersion="5.3.6"
			readOnly={false}
			onChange={onChange}
			onRemove={vi.fn()}
			onEnableAudit={onEnableAudit}
			{...overrides}
		/>,
	);
	return { onChange, onEnableAudit, changed: () => onChange.mock.calls.at(-1)![0] };
}

const typeSelect = () => screen.getByRole('combobox', { name: 'Type' }) as HTMLSelectElement;
const optionsOf = (select: HTMLElement) =>
	within(select).getAllByRole('option').map(option => option.textContent).filter(Boolean);
const choose = (select: HTMLElement, value: string) => fireEvent.change(select, { target: { value } });
const addSource = () => screen.getByRole('combobox', { name: 'Add a source field' });

describe('FieldRow type list', () => {
	it.each([
		['5.3.0', true],
		['5.3.6', true],
		[undefined, false],
		['5.3.0-beta.4', false],
		['5.2.15', false],
	])('on Harper %s offers FullText: %s', (harperVersion, offered) => {
		renderRow({ field: fieldOf(PRODUCT, 'title'), harperVersion });
		const options = optionsOf(typeSelect());
		expect(options.includes('FullText')).toBe(offered);
	});

	it('keeps an existing FullText field’s type selectable on an older Harper rather than dropping it', () => {
		renderRow({ harperVersion: '5.2.15' });
		expect(optionsOf(typeSelect())).toContain('FullText');
	});

	it('starts an empty declaration when switching to FullText, dropping what FullText can’t carry', () => {
		const title: FieldModel = {
			...fieldOf(PRODUCT, 'title'),
			type: { kind: 'list', of: { kind: 'named', name: 'String', nonNull: false }, nonNull: true },
			directives: [{ name: 'indexed', args: [], hadParens: false }],
		};
		const { changed } = renderRow({ field: title });
		choose(typeSelect(), 'FullText');
		expect(changed().type).toEqual({ kind: 'named', name: 'FullText', nonNull: false });
		expect(changed().directives.map(directive => directive.name)).toEqual(['fullText']);
		expect(readFullTextConfig(changed())?.fields).toEqual([]);
	});

	it('drops @fullText when switching away from FullText', () => {
		const { changed } = renderRow();
		choose(typeSelect(), 'String');
		expect(changed().type).toEqual({ kind: 'named', name: 'String', nonNull: false });
		expect(changed().directives).toEqual([]);
	});
});

describe('FieldRow full-text panel', () => {
	it('replaces the scalar controls with the index editor', () => {
		renderRow();
		expect(screen.queryByRole('switch', { name: 'Array' })).toBeNull();
		expect(screen.queryByRole('switch', { name: /Primary key/ })).toBeNull();
		expect(screen.getByRole('region', { name: 'Source fields' })).toBeTruthy();
	});

	it('lists the sources in order, and offers only the table’s unused text fields to add', () => {
		renderRow();
		const sources = within(screen.getByRole('region', { name: 'Source fields' })).getAllByRole('listitem');
		expect(sources.map(item => item.textContent)).toEqual([
			expect.stringContaining('title'),
			expect.stringContaining('description'),
		]);
		const offered = optionsOf(addSource());
		expect(offered).toEqual(['tags ([String])', 'manual (Blob, text/plain)']);
	});

	it('adds a Blob source with the media type Harper requires', () => {
		const { changed } = renderRow();
		choose(addSource(), 'manual');
		expect(readFullTextConfig(changed())?.fields.at(-1)).toEqual({ name: 'manual', mediaType: 'text/plain' });
	});

	it('reorders, reweights, highlights and removes sources', () => {
		const { changed } = renderRow();
		fireEvent.click(screen.getByTitle('Move description up'));
		expect(readFullTextConfig(changed())?.fields.map(source => source.name)).toEqual(['description', 'title']);

		fireEvent.change(screen.getAllByLabelText('Weight')[1], { target: { value: '2.5' } });
		expect(readFullTextConfig(changed())?.fields[1]).toEqual({ name: 'description', weight: 2.5 });

		// Clearing a weight removes it, so Harper's default of 1 applies.
		fireEvent.change(screen.getAllByLabelText('Weight')[0], { target: { value: '' } });
		expect(readFullTextConfig(changed())?.fields[0]).toEqual({ name: 'title' });

		fireEvent.click(screen.getAllByRole('switch', { name: 'Highlight' })[0]);
		expect(readFullTextConfig(changed())?.fields[0]).toEqual({ name: 'title', weight: 3, highlight: true });

		fireEvent.click(screen.getByTitle('Remove title'));
		expect(readFullTextConfig(changed())?.fields).toEqual([{ name: 'description' }]);
	});

	it('turns highlighting on with Harper’s defaults, and analyzer options off explicitly', () => {
		const { changed } = renderRow();
		fireEvent.click(screen.getByRole('switch', { name: /^Highlighting/ }));
		expect(getArgValue(changed().directives, 'fullText', 'highlighting')).toBe('{}');

		fireEvent.click(screen.getByRole('switch', { name: /^Positions/ }));
		expect(getArgValue(changed().directives, 'fullText', 'positions')).toBe('false');
	});

	it('edits synonym rules, keeping the replacements as typed', () => {
		const { changed } = renderRow();
		fireEvent.click(screen.getByRole('button', { name: /Add synonym/ }));
		expect(readFullTextConfig(changed())?.synonyms).toEqual([{ source: '', replacements: [] }]);
	});

	it('asks for an audited table, and turns audit on when told to', () => {
		const unaudited = tableOf(`type T @table {
	id: ID @primaryKey
	body: String
	search: FullText @fullText(fields: [{ name: "body" }])
}`);
		const { onEnableAudit } = renderRow({ table: unaudited, field: fieldOf(unaudited, 'search') });
		expect(screen.getByText('Turn on audit for this table')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Turn on audit' }));
		expect(onEnableAudit).toHaveBeenCalledOnce();
	});

	it('says plainly that Harper ignores the index while audit is explicitly off', () => {
		const off = tableOf(`type T @table(audit: false) {
	id: ID @primaryKey
	body: String
	search: FullText @fullText(fields: [{ name: "body" }])
}`);
		renderRow({ table: off, field: fieldOf(off, 'search') });
		expect(screen.getByText('Audit is off for this table')).toBeTruthy();
	});

	it('says nothing about audit on an audited table', () => {
		renderRow();
		expect(screen.queryByRole('button', { name: 'Turn on audit' })).toBeNull();
	});

	it('shows a declaration it can’t read as text instead of offering to rewrite it', () => {
		const odd = tableOf(`type T @table(audit: true) {
	id: ID @primaryKey
	body: String
	search: FullText @fullText(fields: [{ name: "body", boost: 2 }])
}`);
		renderRow({ table: odd, field: fieldOf(odd, 'search') });
		expect(screen.getByText(/comments or settings the visual editor can’t keep/)).toBeTruthy();
		expect(screen.queryByRole('region', { name: 'Source fields' })).toBeNull();
	});

	it('disables every control when read-only', () => {
		renderRow({ readOnly: true });
		for (const weight of screen.getAllByLabelText('Weight')) {
			expect((weight as HTMLInputElement).disabled).toBe(true);
		}
		expect(screen.queryByRole('combobox', { name: 'Add a source field' })).toBeNull();
		expect(screen.queryByRole('button', { name: /Add synonym/ })).toBeNull();
	});
});

describe('FieldRow synonym replacements', () => {
	function withReplacements(replacements: string) {
		const table = tableOf(`type T @table(audit: true) {
	id: ID @primaryKey
	body: String
	search: FullText @fullText(fields: [{ name: "body" }], synonyms: [{ source: "shoe", replacements: ${replacements} }])
}`);
		return { table, field: fieldOf(table, 'search') };
	}

	it.each([['["a,b"]'], ['[" shoe"]'], ['[""]']])(
		'renders replacements %s that don’t survive a trip through the text, without looping',
		replacements => {
			renderRow(withReplacements(replacements));
			expect(screen.getByLabelText('Replacements, comma-separated')).toBeTruthy();
		},
	);

	it('keeps what was typed, commas and all, while writing the list', () => {
		const { table, field } = withReplacements('["trainer"]');
		let latest = field;
		// Controlled, as the editor is: each change comes back as the next field.
		function Controlled() {
			const [current, setCurrent] = useState(field);
			latest = current;
			return (
				<FieldRow
					field={current}
					table={table}
					typeNames={[]}
					harperVersion="5.3.6"
					readOnly={false}
					onChange={setCurrent}
					onRemove={vi.fn()}
					onEnableAudit={vi.fn()}
				/>
			);
		}
		render(<Controlled />);
		const input = screen.getByLabelText('Replacements, comma-separated') as HTMLInputElement;
		fireEvent.change(input, { target: { value: 'trainer, ' } });
		expect(input.value).toBe('trainer, ');
		fireEvent.change(input, { target: { value: 'trainer, sneaker' } });
		expect(input.value).toBe('trainer, sneaker');
		expect(readFullTextConfig(latest)?.synonyms[0].replacements).toEqual(['trainer', 'sneaker']);
	});
});

describe('FieldRow full-text shapes Harper refuses', () => {
	it('treats a bare FullText field as an index not started yet, and starts @fullText on the first source', () => {
		const table = tableOf(`type T @table(audit: true) {
	id: ID @primaryKey
	body: String
	search: FullText
}`);
		const { changed } = renderRow({ table, field: fieldOf(table, 'search') });
		expect(screen.queryByText(/can’t keep/)).toBeNull();
		fireEvent.change(screen.getByRole('combobox', { name: 'Add a source field' }), { target: { value: 'body' } });
		expect(readFullTextConfig(changed())?.fields).toEqual([{ name: 'body' }]);
	});

	it('offers to remove what a plain FullText field can’t have, keeping its declaration', () => {
		const table = tableOf(`type T @table(audit: true) {
	id: ID @primaryKey
	body: String
	search: [FullText]! @indexed @fullText(fields: [{ name: "body", weight: 2 }])
}`);
		const { changed } = renderRow({ table, field: fieldOf(table, 'search') });
		expect(screen.getByText(/also has Array, Required, @indexed/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Remove them' }));
		expect(changed().type).toEqual({ kind: 'named', name: 'FullText', nonNull: false });
		expect(changed().directives.map(directive => directive.name)).toEqual(['fullText']);
		expect(readFullTextConfig(changed())?.fields).toEqual([{ name: 'body', weight: 2 }]);
	});

	it('says nothing about shape for a plain FullText field', () => {
		renderRow();
		expect(screen.queryByText(/Harper accepts only a plain FullText field/)).toBeNull();
	});
});

describe('FieldRow switching to FullText', () => {
	it('keeps a @fullText that was on the field already, rather than starting over', () => {
		const table = tableOf(`type T @table(audit: true) {
	id: ID @primaryKey
	body: String
	search: String @indexed @fullText(fields: [{ name: "body", weight: 2 }])
}`);
		const { changed } = renderRow({ table, field: fieldOf(table, 'search') });
		fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'FullText' } });
		expect(changed().directives.map(directive => directive.name)).toEqual(['fullText']);
		expect(readFullTextConfig(changed())?.fields).toEqual([{ name: 'body', weight: 2 }]);
	});
});
