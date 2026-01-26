import { BigDecimal, type EventLog, type HandlerContext } from "generated";
import { makeId } from "./utils";

const STATS_ID = "STATS_ID"

export const getOrCreateStats = async (context: HandlerContext) => {
    return context.Stats.getOrCreate({
        id: STATS_ID,
        tvl_id: undefined,
        lastRebalance_id: undefined
    })
}

export const updateTvl = async (context: HandlerContext, event: EventLog<{}>, tvlDelta: BigDecimal) => {
    if (tvlDelta.isZero()) return;

    const stats = await getOrCreateStats(context);

    let amount = tvlDelta;
    if (stats.tvl_id !== undefined) {
        const tvl = await context.TvlSnapshot.getOrThrow(stats.tvl_id);
        amount = amount.plus(tvl.amount);
    }

    context.TvlSnapshot.set({
        id: makeId(event),
        timestamp: event.block.timestamp,
        amount,
    });
    context.Stats.set({
        ...stats,
        tvl_id: makeId(event),
    });
}