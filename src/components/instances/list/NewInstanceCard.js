import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardBody, Col } from 'reactstrap';
import { useStoreState } from 'pullstate';
import appState from '../../../functions/state/appState';

function NewInstanceCard() {
	const navigate = useNavigate();
	const { customer_id } = useParams();
	const platformName = useStoreState(appState, (s) => (s.themes.length === 1 ? s.themes[0] : 'Harper'));

	const handleClick = () => {
		if (window._kmq) window._kmq.push(['record', 'clicked new instance card']);
		navigate(`/o/${customer_id}/instances/new`);
	};

	return (
		<Col xs="12" md="6" lg="4" xl="3" className="mb-4">
			<Card
				tabIndex="0"
				id="newInstanceCard"
				title="Add New Instance"
				className="instance new"
				onKeyDown={(e) => e.keyCode !== 13 || handleClick()}
				onClick={handleClick}
			>
				<CardBody className="d-flex flex-column align-items-center justify-content-center text-nowrap">
					<span className="text-capitalize">Create New {platformName} Cloud Instance</span>
					<div className="my-4">
						<i className="fa fa-2x fa-plus-circle new-instance-plus" />
					</div>
					<span>Register Enterprise Instance</span>
				</CardBody>
			</Card>
		</Col>
	);
}

export default NewInstanceCard;
