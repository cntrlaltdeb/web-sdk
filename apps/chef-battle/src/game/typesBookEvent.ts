export type BookEvent = never;

export type BookEventContext = {
	bookEvents: readonly BookEvent[];
};
