import React from 'react';

import CardBackLeave from './CardBackLeave';
import CardBackDelete from './CardBackDelete';

function CardBack(params) {
	return params.flipState === 'leave' ? <CardBackLeave {...params} /> : <CardBackDelete {...params} />;
}

export default CardBack;
