import React, { useState } from 'react';
import { useStoreState } from 'pullstate';

import appState from '../../../functions/state/appState';

import StaticCard from './CardStatic';
import EditCard from './CardEdit';

function Card() {
	const [editingCard, setEditingCard] = useState(false);
	const hasCard = useStoreState(appState, (s) => s.hasCard, [editingCard]);
	const badCard = useStoreState(
		appState,
		(s) => s.customer?.current_payment_status?.status === 'invoice.payment_failed'
	);
	const formStateHeight = '582px';

	return (
		<div className="mt-3 mb-4">
			{editingCard || !hasCard ? (
				<EditCard
					formStateHeight={formStateHeight}
					setEditingCard={setEditingCard}
					customerCard={hasCard}
					badCard={badCard}
				/>
			) : (
				<StaticCard
					formStateHeight={formStateHeight}
					setEditingCard={setEditingCard}
					customerCard={hasCard}
					badCard={badCard}
				/>
			)}
		</div>
	);
}

export default Card;
