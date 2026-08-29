export type ChefId = 'italian' | 'french' | 'chinese';

export type SymbolId =
	| 'pizza'
	| 'pasta_carbonara'
	| 'tiramisu'
	| 'frog_legs'
	| 'french_onion_soup'
	| 'croissant'
	| 'peking_duck'
	| 'kung_pao_chicken'
	| 'xiaolongbao'
	| 'golden_cloche_wild'
	| 'kitchen_crown_scatter'
	| 'pasta_wild';

export type Position = {
	reel: number;
	row: number;
};

export type GridCell = {
	position: Position;
	symbol: SymbolId;
	isWild: boolean;
	isScatter: boolean;
	multiplier?: number;
};
