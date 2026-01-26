import type { EventLog } from "generated";

export const makeId = (event: EventLog<{}>) => `${event.block.number}-${event.transaction.transactionIndex}-${event.logIndex}`
