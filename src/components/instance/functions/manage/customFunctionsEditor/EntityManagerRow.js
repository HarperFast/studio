import React, { useState } from 'react';
import { Row, Col, Button } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';
import { useParams, useNavigate } from 'react-router-dom';

import instanceState from '../../../../../functions/state/instanceState';
import buildCustomFunctions from '../../../../../functions/instance/functions/buildCustomFunctions';
import dropCustomFunction from '../../../../../functions/api/instance/dropCustomFunction';
import dropCustomFunctionProject from '../../../../../functions/api/instance/dropCustomFunctionProject';
import restartService from '../../../../../functions/api/instance/restartService';

function EntityManagerRow({ item, baseUrl, isActive, toggleDropItem, isDropping, itemType, restarting }) {
	const { project } = useParams();
	const navigate = useNavigate();
	const alert = useAlert();
	const [isConfirmingDropItem, toggleConfirmDropItem] = useState(false);
	const [confirmedDropItem, setConfirmedDropItem] = useState(false);
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);

	const handleDropItem = async () => {
		if (!isConfirmingDropItem) return false;

		let result;

		if (itemType === 'projects') {
			result = await dropCustomFunctionProject({ auth, url, project: item });
		} else {
			result = await dropCustomFunction({ auth, url, project, type: itemType, file: item });
		}

		if (result.error) {
			toggleConfirmDropItem(false);
			setConfirmedDropItem(false);
			return alert.error(result.message);
		}

		alert.success(result.message);
		restartService({ auth, url, service: 'custom_functions' });
		await buildCustomFunctions({ auth, url });
		return navigate(baseUrl);
	};

	const selectItemForDrop = () => {
		toggleConfirmDropItem(item);
		toggleDropItem(false);
	};

	const confirmItemForDrop = () => {
		toggleConfirmDropItem(false);
		setConfirmedDropItem(true);
		handleDropItem();
	};

	const cancelConfirmDrop = () => {
		toggleConfirmDropItem(false);
	};

	const handleSetActive = () =>
		isActive || isDropping || isConfirmingDropItem ? false : navigate(`${baseUrl}/${item}`);

	return (
		<Row
			key={item}
			title={`View${isActive ? 'ing' : ''} ${item}`}
			className={`item-row ${isActive ? 'active' : ''}`}
			onClick={restarting ? null : handleSetActive}
			tabIndex="0"
		>
			<Col className={`item-label ${isConfirmingDropItem ? 'text-danger text-nowrap' : ''}`}>
				{isConfirmingDropItem ? `drop ${item}?` : itemType === 'projects' ? `/${item}` : item}
			</Col>
			<Col className="item-action">
				{confirmedDropItem ? (
					<Button tabIndex="-1" disabled color="purple" className="round">
						<i className="fa fa-spinner fa-spin" />
					</Button>
				) : isConfirmingDropItem ? (
					<>
						<Button
							id="confirmDropItem"
							color="danger"
							className="round me-1"
							title={`confirm drop ${item}`}
							onClick={confirmItemForDrop}
						>
							<i className="fa fa-check text-white" />
						</Button>
						<Button
							id="cancelDropItem"
							color="black"
							className="round"
							title={`Cancel drop ${item}`}
							onClick={cancelConfirmDrop}
						>
							<i className="fa fa-times text-white" />
						</Button>
					</>
				) : isDropping ? (
					<Button id="dropItem" color="danger" className="round" title={`Drop ${item}`} onClick={selectItemForDrop}>
						<i className="fa fa-minus text-white" />
					</Button>
				) : isActive ? (
					<Button tabIndex="-1" color="purple" className="round">
						<i className="fa fa-chevron-right" />
					</Button>
				) : null}
			</Col>
		</Row>
	);
}

export default EntityManagerRow;
