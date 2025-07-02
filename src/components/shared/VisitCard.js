import React from 'react';
import { Button } from 'reactstrap';

function VisitCard({ disabled, label, onClick }) {
	return (
		<Button
			onClick={onClick}
			title={label}
			block
			disabled={disabled}
			color="danger"
			className="mt-2"
			id="visitCreditCard"
		>
			{label}
		</Button>
	);
}

export default VisitCard;
