import React from 'react';
import { Row, Col, Button } from 'reactstrap';

function RoleManagerHeader({ items, itemType, toggleDropItem, isDropping, toggleCreate, isCreating, showForm }) {
	return (
		<Row className="floating-card-header">
			<Col>{itemType}s</Col>
			{showForm && items && items.length ? (
				<Col className="text-end">
					<Button
						color="link"
						title={`Remove ${itemType}s`}
						className="add-remove me-3"
						onClick={() => {
							toggleDropItem(!isDropping);
							toggleCreate(false);
						}}
					>
						<i className="fa fa-minus" />
					</Button>
					<Button
						color="link"
						title={`Add ${itemType}`}
						className="add-remove me-1"
						onClick={() => {
							toggleCreate(!isCreating);
							toggleDropItem(false);
						}}
					>
						<i className="fa fa-plus" />
					</Button>
				</Col>
			) : null}
		</Row>
	);
}

export default RoleManagerHeader;
