import { BigDecimal, type EventLog, type HandlerContext } from "generated";
import type { Address } from "viem";
import { makeId } from "./utils";

const DECIMALS_18 = new BigDecimal(10).pow(18);
const MIN_HOLD_FOR_STREAK = new BigDecimal(0);

const getOrCreateWallet = async (context: HandlerContext, address: Address) => {
    return context.Wallet.getOrCreate({
        id: address,
        assetBalance_id: undefined,
        shareBalance_id: undefined,
    })
}

export const changeShareBalance = async (
    context: HandlerContext,
    event: EventLog<{}>,
    address: Address,
    delta: bigint,
) => {
    const wallet = await getOrCreateWallet(context, address);

    let amount: BigDecimal = new BigDecimal(delta.toString()).div(DECIMALS_18)
    let holdingStreak: number = 0;
    if (wallet.shareBalance_id !== undefined) {
        const shareBalance = await context.ShareBalanceSnapshot.getOrThrow(wallet.shareBalance_id);
        amount = amount.plus(shareBalance.amount);
        holdingStreak = shareBalance.amount.gt(MIN_HOLD_FOR_STREAK)
            ? shareBalance.holdingStreak + event.block.timestamp - shareBalance.timestamp
            : 0;
    }

    context.ShareBalanceSnapshot.set({
        id: makeId(event),
        wallet_id: wallet.id,
        timestamp: event.block.timestamp,
        amount,
        holdingStreak,
    });

    context.Wallet.set({
        ...wallet,
        shareBalance_id: makeId(event),
    });
}

export const changeAssetBalance = async (
    context: HandlerContext,
    event: EventLog<{}>,
    address: Address,
    delta: bigint,
) => {
    const wallet = await getOrCreateWallet(context, address);

    let amount: BigDecimal = new BigDecimal(delta.toString()).div(DECIMALS_18)
    let holdingStreak: number = 0;
    if (wallet.assetBalance_id !== undefined) {
        const assetBalance = await context.AssetBalanceSnapshot.getOrThrow(wallet.assetBalance_id);
        amount = amount.plus(assetBalance.amount);
        holdingStreak = assetBalance.amount.gt(MIN_HOLD_FOR_STREAK)
            ? assetBalance.holdingStreak + event.block.timestamp - assetBalance.timestamp
            : 0;
    }

    context.AssetBalanceSnapshot.set({
        id: makeId(event),
        wallet_id: wallet.id,
        timestamp: event.block.timestamp,
        amount,
        holdingStreak,
    });

    context.Wallet.set({
        ...wallet,
        assetBalance_id: makeId(event),
    });
}