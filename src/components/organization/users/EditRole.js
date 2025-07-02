import React, { useState } from 'react';
import { Row, Col, Button } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { useParams } from 'react-router-dom';
import useAsyncEffect from 'use-async-effect';
import { ErrorBoundary } from 'react-error-boundary';
import ToggleButton from 'react-toggle';
import { useAlert } from 'react-alert';

import appState from '../../../functions/state/appState';
import updateOrgUser from '../../../functions/api/lms/updateOrgUser';
import getUsers from '../../../functions/api/lms/getUsers';
import addError from '../../../functions/api/lms/addError';
import ErrorFallback from '../../shared/ErrorFallback';

function EditRole() {
	const { user_id } = useParams();
	const { customer_id } = useParams();
	const alert = useAlert();
	const auth = useStoreState(appState, (s) => s.auth);
	const currentUser = useStoreState(appState, (s) => s.users && s.users.find((u) => u.user_id === user_id), [user_id]);
	const [currentStatus, setCurrentStatus] = useState(false);
	const [formState, setFormState] = useState({});

	useAsyncEffect(() => {
		setCurrentStatus(currentUser && currentUser.orgs?.find((o) => o.customer_id?.toString() === customer_id)?.status);
	}, [currentUser, customer_id]);

	useAsyncEffect(async () => {
		const { submitted, processing } = formState;
		if (submitted && !processing) {
			const newRole =
				currentStatus === 'declined'
					? 'invited'
					: currentStatus === 'accepted'
						? 'owner'
						: currentStatus === 'owner'
							? 'accepted'
							: 'invited';
			setCurrentStatus(newRole);
			const response = await updateOrgUser({
				auth,
				user_id,
				user_id_owner: auth.user_id,
				customer_id,
				status: newRole,
			});
			if (response.error) {
				alert.error(response.message);
				setFormState({});
			} else {
				alert.success(`User role updated to ${newRole === 'accepted' ? 'user' : newRole}`);
				setFormState({});
				getUsers({ auth, customer_id });
			}
		}
	}, [formState]);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack }, customer_id })}
			FallbackComponent={ErrorFallback}
		>
			{!['invited', 'declined'].includes(currentStatus) ? (
				<Row>
					<Col xs="8" className="py-1">
						Is Owner
						<br />
						<span className="text-small">can invite other users, add instances</span>
					</Col>
					<Col xs="4">
						<div className="role-toggle-holder">
							<ToggleButton checked={currentStatus === 'owner'} onChange={() => setFormState({ submitted: true })} />
						</div>
					</Col>
				</Row>
			) : currentStatus === 'declined' ? (
				<Row>
					<Col xs="8" className="py-1">
						User declined invitation to join
						<br />
						<span className="text-small">reinvite them by clicking this button</span>
					</Col>
					<Col xs="4">
						<Button
							id="reinviteOrganizationUser"
							block
							color="success"
							onClick={() => setFormState({ submitted: true })}
							disabled={formState.submitted}
						>
							{formState.submitted ? <i className="fa fa-spinner fa-spin text-white" /> : <span>Reinvite User</span>}
						</Button>
					</Col>
				</Row>
			) : (
				<Row>
					<Col className="py-1">
						User has not yet accepted invitation
						<br />
						<span className="text-small">You must wait for them to accept before modifying them</span>
					</Col>
				</Row>
			)}
		</ErrorBoundary>
	);
}

export default EditRole;
