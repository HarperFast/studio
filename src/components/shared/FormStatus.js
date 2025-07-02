import React from 'react';
import { Card, CardBody } from 'reactstrap';

function FormStatus({ header, subhead = ' ', height, status, className }) {
	return (
		<Card className={`form-status ${className}`}>
			<CardBody className="text-center" style={{ height }}>
				<div className="text-bold">{header}</div>
				<div className="py-4">
					<i
						className={`fa fa-lg ${
							status === 'processing'
								? 'fa-spinner fa-spin text-purple'
								: status === 'success'
									? 'fa-check-circle text-purple'
									: 'fa-exclamation-triangle text-danger'
						}`}
					/>
				</div>
				<div className="text-grey">{subhead}</div>
			</CardBody>
		</Card>
	);
}

export default FormStatus;
