import React, { useCallback } from 'react';
import { Button } from 'reactstrap';

import useInstanceAuth from '../../../functions/state/instanceAuths';

function CardFrontIcons({
	isReady,
	showLogout,
	setFlipState,
	compute_stack_id,
	instance_name,
	isOrgOwner,
	onlyDelete,
}) {
	const [instanceAuths, setInstanceAuths] = useInstanceAuth({});

	const logOut = useCallback((e) => {
		e.stopPropagation();
		setInstanceAuths({ ...instanceAuths, [compute_stack_id]: false });
		// eslint-disable-next-line
	}, []);

	const flipToDelete = useCallback((e) => {
		e.stopPropagation();
		setFlipState('delete');
		// eslint-disable-next-line
	}, []);

	return (
		<>
			{!isReady ? (
				<i className="instance-icon fa fa-spinner fa-spin text-purple" />
			) : showLogout && !onlyDelete ? (
				<Button color="link" title={`Log out of instance ${instance_name}`} className="instance-icon" onClick={logOut}>
					<i className="fa fa-lock text-purple" />
				</Button>
			) : !onlyDelete ? (
				<i className="instance-icon fa fa-unlock-alt text-danger" />
			) : null}
			{isReady && isOrgOwner && (
				<Button
					color="link"
					title={`Remove instance ${instance_name}`}
					className="instance-icon"
					onClick={flipToDelete}
				>
					<i className="fa fa-trash text-purple" />
				</Button>
			)}
		</>
	);
}

export default CardFrontIcons;
