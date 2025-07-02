import React from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { CardBody, Card, Button, Col, Row } from 'reactstrap';

import Password from './EditPassword';
import Role from './EditRole';
import Delete from './EditDelete';

function Edit() {
	const { username } = useParams();
	const { pathname } = useLocation();
	const navigate = useNavigate();

	return (
		<>
			<div className="floating-card-header">
				existing users &gt; edit &gt; <b>{username}</b>
			</div>
			<Card className="my-3">
				<CardBody>
					<Password />
					<hr className="my-3" />
					<Role />
					<hr className="my-3" />
					<Delete />
					<hr className="my-3" />
					<Row>
						<Col xs="8" className="py-1" />
						<Col xs="4">
							<Button
								id="returnToUserList"
								block
								color="grey"
								onClick={() => navigate(pathname.replace(`/${username}`, ''))}
							>
								Return to User List
							</Button>
						</Col>
					</Row>
				</CardBody>
			</Card>
		</>
	);
}

export default Edit;
