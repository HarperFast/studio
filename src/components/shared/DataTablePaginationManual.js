import React from 'react';
import { Row, Col, Input, Button } from 'reactstrap';

// Our table component
function DataTablePaginationManual({ page, pageSize, totalPages, onPageChange, onPageSizeChange, loading }) {
	return (
		<Row className="pagination">
			<Col xs="12" sm="2" className="previous">
				<Button
					className="mb-2 btn-pagination"
					color="purple"
					block
					onClick={() => onPageChange(page - 1)}
					disabled={!totalPages || page === 0}
				>
					<i className="fa fa-chevron-left" />
				</Button>
			</Col>
			<Col xs="12" sm="4" className="paginator">
				<i className="fa fa-book me-2" />
				<Input
					className="mb-2"
					type="number"
					value={page + 1}
					min={1}
					max={totalPages}
					onChange={(e) => onPageChange(e.target.value - 1)}
				/>
				<div className="page-count">&nbsp;/&nbsp;{loading ? <i className="fa fa-spinner fa-spin" /> : totalPages}</div>
			</Col>
			<Col xs="12" sm="4" className="page-size">
				<Input className="mb-2" type="select" value={pageSize} onChange={(e) => onPageSizeChange(e.target.value)}>
					{[20, 50, 100, 250].map((pageSizeValue) => (
						<option key={pageSizeValue} value={pageSizeValue}>
							{pageSizeValue} rows
						</option>
					))}
				</Input>
			</Col>
			<Col xs="12" sm="2" className="next">
				<Button
					className="mb-2 pull-right btn-pagination"
					block
					color="purple"
					onClick={() => onPageChange(page + 1)}
					disabled={!totalPages || page + 1 === totalPages}
				>
					<i className="fa fa-chevron-right" />
				</Button>
			</Col>
		</Row>
	);
}

export default DataTablePaginationManual;
