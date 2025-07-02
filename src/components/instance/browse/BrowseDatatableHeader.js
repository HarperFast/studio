import React from 'react';
import { Col, Row, Button } from 'reactstrap';
import { useNavigate, useParams } from 'react-router-dom';

import commaNumbers from '../../../functions/util/commaNumbers';
import { clearTableDescriptionCache } from '../../../functions/instance/state/describeTableCache';

function BrowseDatatableHeader({
	totalRecords,
	loading,
	loadingFilter,
	refresh,
	autoRefresh,
	onlyCached,
	toggleAutoRefresh,
	toggleOnlyCached,
	toggleFilter,
}) {
	const navigate = useNavigate();
	const { compute_stack_id, schema, table, customer_id } = useParams();

	return (
		<Row className="floating-card-header">
			<Col>
				{schema}
				&nbsp;
				{table && `> ${table} > `}
				{!autoRefresh && (loading || loadingFilter) ? (
					<i className="fa fa-spinner fa-spin" />
				) : (
					<span>
						{commaNumbers(totalRecords)} record
						{totalRecords !== 1 ? 's' : ''}
					</span>
				)}
			</Col>
			<Col className="text-end">
				<Button
					id="refresh"
					color="link"
					tabIndex="0"
					title={`Refresh table ${table}`}
					className="me-2"
					onClick={refresh}
				>
					<i className={`fa ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`} />
				</Button>
				<Button
					id="toggleAutoRefresh"
					color="link"
					tabIndex="0"
					title="Turn on Auto-Refresh"
					onClick={toggleAutoRefresh}
				>
					<span className="me-2">auto</span>
					<i className={`fa fa-lg fa-toggle-${autoRefresh ? 'on' : 'off'}`} />
				</Button>
				<span className="mx-3 text">|</span>
				<Button
					id="toggleOnlyCached"
					color="link"
					tabIndex="0"
					title="Only show cached data"
					onClick={toggleOnlyCached}
				>
					<span className="me-2">only cached</span>
					<i className={`fa fa-lg fa-toggle-${onlyCached ? 'on' : 'off'}`} />
				</Button>
				<span className="mx-3 text">|</span>
				<Button
					id="toggleSearch"
					color="link"
					tabIndex="0"
					title={`Filter table ${table}`}
					className="me-3"
					onClick={toggleFilter}
				>
					<i className="fa fa-search" />
				</Button>
				<Button
					id="addRecord"
					color="link"
					tabIndex="0"
					title={`Add new record to table ${table}`}
					className="me-3"
					onClick={() => {
						clearTableDescriptionCache();
						navigate(`/o/${customer_id}/i/${compute_stack_id}/browse/${schema}/${table}/add`);
					}}
				>
					<i className="fa fa-plus" />
				</Button>
				<Button
					id="bulkUpload"
					color="link"
					tabIndex="0"
					className="me-2"
					title={`Bulk Upload CSV to ${table}`}
					onClick={() => navigate(`/o/${customer_id}/i/${compute_stack_id}/browse/${schema}/${table}/csv`)}
				>
					<i className="fa fa-file-upload" />
				</Button>
			</Col>
		</Row>
	);
}

export default BrowseDatatableHeader;
