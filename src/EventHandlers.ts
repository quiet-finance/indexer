import {
  LiquidityHub,
  USDC,
  QUSD,
  SQUSD,
  Router,
  BigDecimal,
  type HandlerContext,
} from "generated";
import { getVaultStats } from "./effects";
import { zeroAddress } from "viem";
import { parseQusdAmount, parseSqusdAmount, parseUsdcAmount, tokens } from "./contracts";

import { changeAssetBalance, changeShareBalance, getOrCreateWallet } from "./logic/balances";
import { makeId } from "./logic/utils";
import { getOrCreateStats, updateEarnings, updateTvl } from "./logic/stats";

const REDEEM_QUEUE_ID = "REDEEM_QUEUE_ID"
const getOrCreateRedeemQueue = async (context: HandlerContext) => await context.RedeemQueue.getOrCreate({
  id: REDEEM_QUEUE_ID,
  redeemsCount: 0,
  claimedRedeemsCount: 0,
  redeemAssets: new BigDecimal(0),
  claimedRedeemAssets: new BigDecimal(0),
  processedRedeemsCount: 0
});

const REBALANCE_IN_PROGRESS_ID = "REBALANCE_IN_PROGRESS_ID"

LiquidityHub.RebalanceStarted.handler(async ({ event, context }) => {
  context.RebalanceInProgress.set({
    id: REBALANCE_IN_PROGRESS_ID,
    deployedUnderlyingBefore: parseUsdcAmount(event.params.deployedUnderlying),
  });
});

LiquidityHub.RebalanceFinished.handler(async ({ event, context }) => {
  const { stakedAssets, totalShares } = await context.effect(getVaultStats, { blockNumber: BigInt(event.block.number) });
  const stats = await getOrCreateStats(context);
  const rebalanceInProgress = await context.RebalanceInProgress.getOrThrow(REBALANCE_IN_PROGRESS_ID);
  context.RebalanceInProgress.deleteUnsafe(REBALANCE_IN_PROGRESS_ID);

  context.Rebalance.set({
    id: makeId(event),
    idx: stats.lastRebalance_id !== undefined ?
      (await context.Rebalance.getOrThrow(stats.lastRebalance_id)).idx + 1
      : 0,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    stakedAssets,
    totalShares,
    prevRebalance_id: stats.lastRebalance_id,
    deployedUnderlyingBefore: rebalanceInProgress.deployedUnderlyingBefore,
    deployedUnderlyingAfter: parseUsdcAmount(event.params.deployedUnderlying),
  });
  context.Stats.set({
    ...stats,
    lastRebalance_id: makeId(event),
  });

  const earningsDelta = parseUsdcAmount(event.params.deployedUnderlying).minus(rebalanceInProgress.deployedUnderlyingBefore)
  await updateEarnings(context, event, earningsDelta);
});

LiquidityHub.Issue.handler(async ({ event, context }) => {
  // TODO: if deposited via router, we should use correct address and correct tokenIn
  const tokenIn = tokens.USDC.address;

  const stats = await getOrCreateStats(context);
  context.Action.set({
    id: makeId(event),
    idx: stats.totalActions,
    wallet_id: event.params.recipient,
    actionType: "ISSUE",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn,
    amountIn: parseUsdcAmount(event.params.underlyingAmount),
    tokenOut: tokens.qUSD.address,
    amountOut: parseQusdAmount(event.params.assetAmount),
  });
  context.Stats.set({
    ...stats,
    totalActions: stats.totalActions + 1
  })
})

LiquidityHub.InstantRedeem.handler(async ({ event, context }) => {
  const stats = await getOrCreateStats(context);
  context.Action.set({
    id: makeId(event),
    idx: stats.totalActions,
    wallet_id: event.params.recipient,
    actionType: "INSTANT_REDEEM",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn: tokens.qUSD.address,
    amountIn: parseQusdAmount(event.params.assetAmount),
    tokenOut: tokens.USDC.address,
    amountOut: parseUsdcAmount(event.params.underlyingAmount),
  });
  context.Stats.set({
    ...stats,
    totalActions: stats.totalActions + 1
  })
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
  const stats = await getOrCreateStats(context);
  const redeemQueue = await getOrCreateRedeemQueue(context);
  const redeemRequest = await context.RedeemRequest.getOrThrow(`${event.params.redeemId}`)

  await getOrCreateWallet(context, event, event.params.recipient);
  context.Action.set({
    id: makeId(event),
    idx: stats.totalActions,
    wallet_id: event.params.recipient,
    actionType: "REDEEM",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn: tokens.qUSD.address,
    amountIn: parseUsdcAmount(event.params.underlyingAmount),
    tokenOut: tokens.USDC.address,
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
  context.Stats.set({
    ...stats,
    totalActions: stats.totalActions + 1
  });
})

LiquidityHub.RedeemsProcessed.handler(async ({ event, context }) => {
  const redeemQueue = await getOrCreateRedeemQueue(context);

  context.RedeemQueue.set({
    ...redeemQueue,
    processedRedeemsCount: Number(event.params.lastProcessedRedeemId)
  });
})

USDC.Transfer.handler(async ({ event, context }) => {
  if (event.params.from === zeroAddress) {
    await getOrCreateWallet(context, event, event.params.to);
    context.FaucetCall.set({
      id: makeId(event),
      wallet_id: event.params.to,
      timestamp: event.block.timestamp
    });
  }
});

SQUSD.Transfer.handler(async ({ event, context }) => {
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
    await changeAssetBalance(context, event, event.params.from, parseQusdAmount(event.params.amount).negated());
  } else {
    tvlDelta += event.params.amount;
  }

  if (event.params.to !== zeroAddress) {
    await changeAssetBalance(context, event, event.params.to, parseQusdAmount(event.params.amount));
  } else {
    tvlDelta -= event.params.amount;
  }

  await updateTvl(context, event, parseQusdAmount(tvlDelta));
});

SQUSD.Deposit.handler(async ({ event, context }) => {
  const stats = await getOrCreateStats(context);
  context.Action.set({
    id: makeId(event),
    idx: stats.totalActions,
    wallet_id: event.params.owner,
    actionType: "STAKE",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn: tokens.qUSD.address,
    amountIn: parseQusdAmount(event.params.assets),
    tokenOut: tokens.sqUSD.address,
    amountOut: parseSqusdAmount(event.params.shares),
  });
  context.Stats.set({
    ...stats,
    totalActions: stats.totalActions + 1
  })
})

SQUSD.Withdraw.handler(async ({ event, context }) => {
  const stats = await getOrCreateStats(context);
  context.Action.set({
    id: makeId(event),
    idx: stats.totalActions,
    wallet_id: event.params.owner,
    actionType: "UNSTAKE",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn: tokens.sqUSD.address,
    amountIn: parseSqusdAmount(event.params.shares),
    tokenOut: tokens.qUSD.address,
    amountOut: parseQusdAmount(event.params.assets),
  });
  context.Stats.set({
    ...stats,
    totalActions: stats.totalActions + 1
  })
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