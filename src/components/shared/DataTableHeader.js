import React from 'react';
import { Row, Col } from 'reactstrap';

const DataTableHeader = ({
	headerGroups,
	onSortedChange,
	sorted,
	showFilter,
	dynamicAttributesFromDataTable,
	tableDescriptionAttributes,
}) => {
	const isIndexedAttribute = (columnId) => {
		let isIndexed = false;
		tableDescriptionAttributes.forEach((attr) => {
			if (attr.attribute === columnId && (attr.is_primary_key || attr.indexed)) {
				isIndexed = true;
			}
		});
		return isIndexed;
	};

	return headerGroups.map((headerGroup) => {
		const { key, ...rest } = headerGroup.getHeaderGroupProps();
		return (
			<div key={key} {...rest}>
				<Row className="header g-0">
					{headerGroup.headers.map((column) => (
						<Col
							key={column.id}
							onClick={() => {
								if (
									dynamicAttributesFromDataTable &&
									!dynamicAttributesFromDataTable.includes(column.id) &&
									isIndexedAttribute(column.id)
								) {
									onSortedChange([{ id: column.id, desc: sorted[0]?.id === column.id ? !sorted[0]?.desc : false }]);
								}
							}}
							className={`${sorted[0]?.id === column.id ? 'sorted' : ''} ${sorted[0]?.desc ? 'desc' : 'asc'} ${column.id.indexOf('hdb-narrow') !== -1 ? 'action' : ''} px-1 ${dynamicAttributesFromDataTable && !dynamicAttributesFromDataTable.includes(column.id) && isIndexedAttribute(column.id) ? '' : 'disabled-column'}`}
						>
							<div className="text-renderer">{column.render('Header')}</div>
						</Col>
					))}
				</Row>
				{showFilter && (
					<Row className="filter g-0">
						{headerGroup.headers.map((column) => (
							<Col key={column.id} className={column.id.indexOf('hdb-narrow') !== -1 ? 'action' : ''}>
								{column.render('Filter')}
							</Col>
						))}
					</Row>
				)}
			</div>
		);
	});
};
export default DataTableHeader;
