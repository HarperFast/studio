import React, { useState } from 'react';
import { Row, Col, Button } from 'reactstrap';
import { useNavigate } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';

import queryInstance from '../../../functions/api/queryInstance';
import instanceState from '../../../functions/state/instanceState';
import buildInstanceStructure from '../../../functions/instance/browse/buildInstanceStructure';

function EntityManagerRow({ item, itemType, baseUrl, isActive, toggleDropItem, isDropping, activeSchema }) {
	const navigate = useNavigate();
	const alert = useAlert();
	const [isConfirmingDropItem, toggleConfirmDropItem] = useState(false);
	const [confirmedDropItem, setConfirmedDropItem] = useState(false);
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);

	const handleDropItem = async () => {
		if (!itemType || !isConfirmingDropItem) return false;

		const operation = {
			operation: `drop_${itemType}`,
		};

		if (itemType === 'table') {
			operation.schema = activeSchema;
			operation.table = item;
		} else {
			operation.schema = item;
		}

		const result = await queryInstance({ operation, auth, url });

		if (result.error) {
			toggleConfirmDropItem(false);
			setConfirmedDropItem(false);
			return alert.error(result.message);
		}

		await buildInstanceStructure({ auth, url });

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

	const syncInstanceStructure = () => {
		buildInstanceStructure({ auth, url });
	};
	const handleSetActive = () =>
		isActive || isDropping || isConfirmingDropItem ? false : navigate(`${baseUrl}/${item}`);

	return (
		<Row
			key={item}
			title={`View${isActive ? 'ing' : ''} ${itemType} ${item}`}
			className={`item-row ${isActive ? 'active' : ''}`}
			onClick={() => {
				handleSetActive();
				syncInstanceStructure();
			}}
			tabIndex="0"
		>
			<Col className={`item-label ${isConfirmingDropItem ? 'text-danger text-nowrap' : ''}`}>
				{isConfirmingDropItem ? `drop ${item}?` : item}
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
							title={`confirm drop ${itemType} ${item}`}
							onClick={confirmItemForDrop}
						>
							<i className="text-white fa fa-check" />
						</Button>
						<Button
							id="cancelDropItem"
							color="black"
							className="round"
							title={`Cancel drop ${itemType} ${item}`}
							onClick={cancelConfirmDrop}
						>
							<i className="text-white fa fa-times" />
						</Button>
					</>
				) : isDropping ? (
					<Button
						id="dropItem"
						color="danger"
						className="round"
						title={`Drop ${itemType} ${item}`}
						onClick={selectItemForDrop}
					>
						<i className="text-white fa fa-minus" />
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
