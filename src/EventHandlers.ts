import {
  LiquidityHub,
  SqUSD,
  Router,
  BigDecimal,
} from "generated";
import { getVaultStats } from "./effects";
import { zeroAddress } from "viem";
import { USDC, parseQusdAmount, parseSqusdAmount, parseUsdcAmount, qUSD, sqUSD } from "./contracts";
import type { HandlerContext } from "generated/src/Types";
import { QUSD } from "generated";

import { changeAssetBalance, changeShareBalance } from "./logic/balances";
import { makeId } from "./logic/utils";
import { getOrCreateStats, updateTvl } from "./logic/stats";

const REDEEM_QUEUE_ID = "REDEEM_QUEUE_ID"
const getOrCreateRedeemQueue = async (context: HandlerContext) => await context.RedeemQueue.getOrCreate({
  id: REDEEM_QUEUE_ID,
  redeemsCount: 0,
  claimedRedeemsCount: 0,
  redeemAssets: new BigDecimal(0),
  claimedRedeemAssets: new BigDecimal(0),
  processedRedeemsCount: 0
});

LiquidityHub.RebalanceFinished.handler(async ({ event, context }) => {
  const { stakedAssets, totalShares } = await context.effect(getVaultStats, { blockNumber: BigInt(event.block.number) });
  const stats = await getOrCreateStats(context);

  context.Rebalance.set({
    id: makeId(event),
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    stakedAssets,
    totalShares,
    prevRebalance_id: stats.lastRebalance_id,
  });
  context.Stats.set({
    ...stats,
    lastRebalance_id: makeId(event),
  });
  return;
});

LiquidityHub.Issue.handler(async ({ event, context }) => {
  // TODO: if deposited via router, we should use correct address and correct tokenIn
  const tokenIn = USDC.address;

  context.Action.set({
    id: makeId(event),
    wallet_id: event.params.recipient,
    actionType: "ISSUE",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn,
    amountIn: parseUsdcAmount(event.params.underlyingAmount),
    tokenOut: qUSD.address,
    amountOut: parseQusdAmount(event.params.assetAmount),
  });
})

LiquidityHub.InstantRedeem.handler(async ({ event, context }) => {
  context.Action.set({
    id: makeId(event),
    wallet_id: event.params.recipient,
    actionType: "INSTANT_REDEEM",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn: qUSD.address,
    amountIn: parseQusdAmount(event.params.assetAmount),
    tokenOut: USDC.address,
    amountOut: parseUsdcAmount(event.params.underlyingAmount),
  });
})

LiquidityHub.RedeemRequest.handler(async ({ event, context }) => {
  const redeemQueue = await getOrCreateRedeemQueue(context);

  context.RedeemQueue.set({
    ...redeemQueue,
    redeemsCount: redeemQueue.redeemsCount + 1,
    redeemAssets: redeemQueue.redeemAssets.plus(parseQusdAmount(event.params.assetAmount))
  });
  context.RedeemRequest.set({
    id: `${event.params.redeemId}`,
    requestedAt: event.block.timestamp,
    requestTxHash: event.transaction.hash,
    redeemer_id: event.params.redeemer,
    recipient_id: event.params.recipient,
    assetAmount: parseQusdAmount(event.params.assetAmount),
    isClaimed: false
  });
})


LiquidityHub.RedeemClaim.handler(async ({ event, context }) => {
  const redeemQueue = await getOrCreateRedeemQueue(context);
  const redeemRequest = await context.RedeemRequest.getOrThrow(`${event.params.redeemId}`)

  context.Action.set({
    id: makeId(event),
    wallet_id: event.params.recipient,
    actionType: "REDEEM",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn: qUSD.address,
    amountIn: parseUsdcAmount(event.params.underlyingAmount),
    tokenOut: USDC.address,
    amountOut: parseUsdcAmount(event.params.underlyingAmount),
  });
  context.RedeemQueue.set({
    ...redeemQueue,
    claimedRedeemsCount: redeemQueue.claimedRedeemsCount + 1,
    claimedRedeemAssets: redeemQueue.claimedRedeemAssets.plus(redeemRequest.assetAmount)
  });
  context.RedeemRequest.set({
    ...redeemRequest,
    isClaimed: true,
  })
})

LiquidityHub.RedeemsProcessed.handler(async ({ event, context }) => {
  const redeemQueue = await getOrCreateRedeemQueue(context);

  context.RedeemQueue.set({
    ...redeemQueue,
    processedRedeemsCount: Number(event.params.lastProcessedRedeemId)
  });
})

SqUSD.Transfer.handler(async ({ event, context }) => {
  if (event.params.from !== zeroAddress) {
    await changeShareBalance(context, event, event.params.from, parseSqusdAmount(event.params.amount).negated());
  }
  if (event.params.to !== zeroAddress) {
    await changeShareBalance(context, event, event.params.to, parseSqusdAmount(event.params.amount));
  }
});

QUSD.Transfer.handler(async ({ event, context }) => {
  let tvlDelta = 0n;

  if (event.params.from !== zeroAddress) {
    await changeAssetBalance(context, event, event.params.from, -event.params.amount);
  } else {
    tvlDelta += event.params.amount;
  }

  if (event.params.to !== zeroAddress) {
    await changeAssetBalance(context, event, event.params.to, event.params.amount);
  } else {
    tvlDelta -= event.params.amount;
  }

  await updateTvl(context, event, parseQusdAmount(tvlDelta));
});

SqUSD.Deposit.handler(async ({ event, context }) => {
  context.Action.set({
    id: makeId(event),
    wallet_id: event.params.owner,
    actionType: "STAKE",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn: qUSD.address,
    amountIn: parseQusdAmount(event.params.assets),
    tokenOut: sqUSD.address,
    amountOut: parseSqusdAmount(event.params.shares),
  });
})

SqUSD.Withdraw.handler(async ({ event, context }) => {
  context.Action.set({
    id: makeId(event),
    wallet_id: event.params.owner,
    actionType: "UNSTAKE",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn: sqUSD.address,
    amountIn: parseSqusdAmount(event.params.shares),
    tokenOut: qUSD.address,
    amountOut: parseQusdAmount(event.params.assets),
  });
})

Router.Deposit.handler(async ({ event, context }) => {
  if (!event.params.staked) return;

  const id = `${event.block.number}-${event.transaction.transactionIndex}-${event.logIndex - 4}`
  const action = await context.Action.getOrThrow(id)

  context.Action.set({
    ...action,
    wallet_id: event.params.user
  })
  context.Action.deleteUnsafe(makeId(event))
})

Router.Withdraw.handler(async ({ event, context }) => {
  if (!event.params.unstaked) return;
  const unstakeIndex = event.logIndex - (event.params.instant ? 5 : 3)

  const id = `${event.block.number}-${event.transaction.transactionIndex}-${unstakeIndex}`
  const action = await context.Action.getOrThrow(id)

  context.Action.set({
    ...action,
    wallet_id: event.params.user
  })
  context.Action.deleteUnsafe(makeId(event))
})