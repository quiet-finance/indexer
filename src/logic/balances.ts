import { BigDecimal, type EventLog, type HandlerContext } from "generated";
import type { Address } from "viem";
import { makeId } from "./utils";

const MIN_HOLD_FOR_STREAK = new BigDecimal(0);

export const getOrCreateWallet = async (context: HandlerContext, address: Address) => {
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
    delta: BigDecimal,
) => {
    const wallet = await getOrCreateWallet(context, address);

    let amount = delta;
    let holdingStreak: number = 0;
    if (wallet.shareBalance_id !== undefined) {
        const shareBalance = await context.ShareBalanceSnapshot.getOrThrow(wallet.shareBalance_id);
        amount = amount.plus(shareBalance.amount);
        holdingStreak = shareBalance.amount.gt(MIN_HOLD_FOR_STREAK)
            ? shareBalance.holdingStreak + event.block.timestamp - shareBalance.timestamp
            : 0;
    }

    const shareBalance_id = `${makeId(event)}:${address}`
    context.ShareBalanceSnapshot.set({
        id: shareBalance_id,
        wallet_id: address,
        timestamp: event.block.timestamp,
        amount,
        holdingStreak,
    });
    context.Wallet.set({ ...wallet, shareBalance_id });

    return shareBalance_id;
}

export const changeAssetBalance = async (
    context: HandlerContext,
    event: EventLog<{}>,
    address: Address,
    delta: BigDecimal,
) => {
    const wallet = await getOrCreateWallet(context, address);

    let amount = delta;
    let holdingStreak: number = 0;
    if (wallet.assetBalance_id !== undefined) {
        const assetBalance = await context.AssetBalanceSnapshot.getOrThrow(wallet.assetBalance_id);
        amount = amount.plus(assetBalance.amount);
        holdingStreak = assetBalance.amount.gt(MIN_HOLD_FOR_STREAK)
            ? assetBalance.holdingStreak + event.block.timestamp - assetBalance.timestamp
            : 0;
    }

    const assetBalance_id = `${makeId(event)}:${address}`
    context.AssetBalanceSnapshot.set({
        id: assetBalance_id,
        wallet_id: wallet.id,
        timestamp: event.block.timestamp,
        amount,
        holdingStreak,
    });
    context.Wallet.set({ ...wallet, assetBalance_id });

    return assetBalance_id;
}