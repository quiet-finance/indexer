import { BigDecimal, type EventLog, type HandlerContext } from "generated";

const STATS_ID = "STATS_ID"

const getDt = (timestamp: number) => {
    const day = 24 * 60 * 60;
    return Math.floor(timestamp / day) * day;
}

export const getOrCreateStats = async (context: HandlerContext) => {
    return context.Stats.getOrCreate({
        id: STATS_ID,
        tvl_id: undefined,
        earnings_id: undefined,
        uniqueWallets_id: undefined,
        lastRebalance_id: undefined,
        totalActions: 0,
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

    const dt = getDt(event.block.timestamp);
    const tvl_id = `tvl-${dt}`
    context.TvlSnapshot.set({
        id: tvl_id,
        dt,
        amount,
    });
    context.Stats.set({
        ...stats,
        tvl_id,
    });
}

export const incUniqueWallets = async (context: HandlerContext, event: EventLog<{}>) => {
    const stats = await getOrCreateStats(context);

    let amount = 0;
    if (stats.uniqueWallets_id !== undefined) {
        const uniqueWallets = await context.UniqueWalletsSnapshot.getOrThrow(stats.uniqueWallets_id);
        amount = uniqueWallets.amount;
    }
    amount++;

    const dt = getDt(event.block.timestamp);
    const uniqueWallets_id = `uniqueWallets-${dt}`

    context.UniqueWalletsSnapshot.set({
        id: uniqueWallets_id,
        dt,
        amount,
    });
    context.Stats.set({
        ...stats,
        uniqueWallets_id,
    });
}

export const updateEarnings = async (context: HandlerContext, event: EventLog<{}>, earningsDelta: BigDecimal) => {
    const stats = await getOrCreateStats(context);

    let amount = earningsDelta;
    if (stats.earnings_id !== undefined) {
        const earnings = await context.EarningsSnapshot.getOrThrow(stats.earnings_id);
        amount = earnings.amount.plus(earningsDelta);
    }

    const dt = getDt(event.block.timestamp);
    const earnings_id = `earnings-${dt}`

    context.EarningsSnapshot.set({
        id: earnings_id,
        dt,
        amount,
    });
    context.Stats.set({
        ...stats,
        earnings_id,
    });
}