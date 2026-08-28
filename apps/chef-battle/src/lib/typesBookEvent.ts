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

export type Position = { reel: number; row: number };
export type MeterValues = Record<ChefId, number>;

type BaseBookEvent = { id: string; roundId: string };

export type BookEvent =
	| (BaseBookEvent & { type: 'roundStart'; betAtomicUnits: number })
	| (BaseBookEvent & { type: 'revealBoard'; board: readonly (readonly SymbolId[])[] })
	| (BaseBookEvent & {
			type: 'clusterWin';
			chef: ChefId;
			symbol: SymbolId;
			positions: readonly Position[];
			payoutAtomicUnits: number;
	  })
	| (BaseBookEvent & { type: 'removeSymbols'; positions: readonly Position[] })
	| (BaseBookEvent & { type: 'cascade'; index: number })
	| (BaseBookEvent & { type: 'chefMeterUpdate'; chef: ChefId; amount: number; total: number })
	| (BaseBookEvent & {
			type: 'pastaPull';
			chef: 'italian';
			positions: readonly Position[];
			meterAfter: number;
	  })
	| (BaseBookEvent & {
			type: 'sauceFinish';
			chef: 'french';
			spots: readonly { position: Position; multiplier: number }[];
			meterAfter: number;
	  })
	| (BaseBookEvent & {
			type: 'wokToss';
			chef: 'chinese';
			positions: readonly Position[];
			targetSymbol: SymbolId;
			meterAfter: number;
	  })
	| (BaseBookEvent & { type: 'kitchenShowdownStart'; totalFreeSpins: number; meters: MeterValues })
	| (BaseBookEvent & { type: 'freeSpinStart'; spin: number; remainingFreeSpins: number })
	| (BaseBookEvent & { type: 'judgeStarUpdate'; chef: ChefId; stars: number })
	| (BaseBookEvent & {
			type: 'kitchenCrownReveal';
			chef: ChefId;
			multiplier: number;
			bonusWinAtomicUnits: number;
			finalBonusWinAtomicUnits: number;
	  })
	| (BaseBookEvent & { type: 'setTotalWin'; totalWinAtomicUnits: number })
	| (BaseBookEvent & { type: 'finalWin'; payoutAtomicUnits: number });

export type BookEventOfType<TType extends BookEvent['type']> = Extract<BookEvent, { type: TType }>;
export type VerticalSliceId = 'VS-01' | 'VS-02' | 'VS-03' | 'VS-04' | 'VS-05';
