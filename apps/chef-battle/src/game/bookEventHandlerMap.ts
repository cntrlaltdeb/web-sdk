import type { BookEvent, BookEventContext } from './typesBookEvent';

export type BookEventHandlerMap = Record<BookEvent, never>;

export const bookEventHandlerMap: BookEventHandlerMap = {};

export type { BookEventContext };
