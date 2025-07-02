import React from 'react';
import { Row, Col } from 'reactstrap';

function DataTableRow({ prepareRow, row, onRowClick = false }) {
	prepareRow(row);

	return (
		<Row onClick={() => onRowClick && onRowClick(row.original)} className="g-0">
			{row.cells.map((cell) => (
				<Col
					key={`${cell.row.id}-${cell.column.id}`}
					className={cell.column.id.indexOf('hdb-narrow') !== -1 ? 'action' : ''}
				>
					{cell.render('Cell')}
				</Col>
			))}
		</Row>
	);
}

export default DataTableRow;
