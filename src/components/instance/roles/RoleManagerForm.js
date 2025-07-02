import React, { useState, useEffect } from 'react';
import { Row, Col, Button, Input, Form } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { useParams, useNavigate } from 'react-router-dom';
import { useAlert } from 'react-alert';

import addRole from '../../../functions/api/instance/addRole';
import instanceState from '../../../functions/state/instanceState';
import listRoles from '../../../functions/api/instance/listRoles';
import isAlphaUnderscore from '../../../functions/util/isAlphaUnderscore';

function RoleManagerForm({ itemType, toggleDropItem, toggleCreate, baseUrl }) {
	const { compute_stack_id, customer_id } = useParams();
	const navigate = useNavigate();
	const alert = useAlert();
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const is_local = useStoreState(instanceState, (s) => s.is_local);
	const existing_roles = useStoreState(instanceState, (s) => s.roles && s.roles.map((r) => r.role));

	const [entity, setEntity] = useState({});

	const createItem = async (e) => {
		e.preventDefault();

		if (!entity.name) {
			setEntity({ ...entity, error: true });
			return alert.error('You must provide a role name');
		}

		if (existing_roles.includes(entity.name)) {
			setEntity({ ...entity, error: true });
			return alert.error('Role with that name already exists');
		}

		if (!isAlphaUnderscore(entity.name)) {
			setEntity({ ...entity, error: true });
			return alert.error('Role names must have only letters and underscores');
		}

		const permission =
			itemType === 'cluster user' ? { cluster_user: true } : itemType === 'super user' ? { super_user: true } : {};

		const response = await addRole({
			auth,
			url,
			is_local,
			compute_stack_id,
			customer_id,
			role: entity.name,
			permission,
		});

		if (response.error) {
			setEntity({ ...entity, error: true });
			return alert.error(response.message);
		}

		setEntity({});
		await listRoles({ auth, url });
		return navigate(`${baseUrl}/${response.id}`);
	};

	useEffect(() => {
		toggleDropItem();
	}, [toggleDropItem]);

	return (
		<Form onSubmit={createItem}>
			<Row className="item-row form">
				<Col className="input-holder">
					<Input
						id="name"
						invalid={entity.error}
						onChange={(e) =>
							setEntity({
								name: e.target.value.toString(),
							})
						}
						type="text"
						name="name"
						placeholder="name"
					/>
				</Col>
				<Col className="item-action">
					<Button id="createRole" color="success" className="round me-1">
						<i className="fa fa-check text-white" />
					</Button>
					<Button color="black" className="round" onClick={() => toggleCreate(false)}>
						<i className="fa fa-times text-white" />
					</Button>
				</Col>
			</Row>
		</Form>
	);
}

export default RoleManagerForm;
