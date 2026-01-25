import {
  LiquidityHub,
  SqUSD,
  type EventLog,
  Router
} from "generated";
import { getVaultStats } from "./effects";
import { getAddress, zeroAddress } from "viem";
import { USDC, qUSD, sqUSD } from "./contracts";
import type { HandlerContext } from "generated/src/Types";
import { QUSD } from "generated";

const REDEEM_QUEUE_ID = "REDEEM_QUEUE_ID"
const STATS_ID = "STATS_ID"
const STARTED_REBALANCE_ID = "STARTED_REBALANCE_ID"

const makeId = (event: EventLog<{}>) => `${event.block.number}-${event.transaction.transactionIndex}-${event.logIndex}`
const asAssetAmount = (underlyingAmount: bigint) => underlyingAmount * (10n ** 12n);

const getOrCreateRedeemQueue = async (context: HandlerContext) => await context.RedeemQueue.getOrCreate({
  id: REDEEM_QUEUE_ID,
  redeemsCount: 0,
  claimedRedeemsCount: 0,
  redeemAssets: 0n,
  claimedRedeemAssets: 0n,
  processedRedeemsCount: 0
});
const getOrCreateStats = async (context: HandlerContext) => await context.Stats.getOrCreate({
  id: STATS_ID,
  tvl: 0n,
})

LiquidityHub.RebalanceStarted.handler(async ({ event, context }) => {
  context.Rebalance.set({
    id: STARTED_REBALANCE_ID,
    timestamp: undefined,
    deployedUnderlyingBefore: event.params.deployedUnderlying,
    startRebalanceTxHash: event.transaction.hash,
    deployedUnderlyingAfter: undefined,
    endRebalanceTxHash: undefined,
    totalShares: undefined,
    stakedAssets: undefined,
  });
});

LiquidityHub.RebalanceFinished.handler(async ({ event, context }) => {
  const { stakedAssets, totalShares } = await context.effect(getVaultStats, { blockNumber: BigInt(event.block.number) });
  const startedRebalance = await context.Rebalance.getOrThrow(STARTED_REBALANCE_ID);

  context.Rebalance.set({
    ...startedRebalance,
    id: makeId(event),
    timestamp: event.block.timestamp,
    deployedUnderlyingAfter: event.params.deployedUnderlying,
    endRebalanceTxHash: event.transaction.hash,
    stakedAssets,
    totalShares,
  })
});

LiquidityHub.Issue.handler(async ({ event, context }) => {
  // TODO: if deposited via router, we should use correct address and correct tokenIn
  const tokenIn = USDC.address;

  context.Action.set({
    id: makeId(event),
    address: event.params.recipient,
    actionType: "ISSUE",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn,
    amountIn: event.params.underlyingAmount,
    tokenOut: qUSD.address,
    amountOut: event.params.assetAmount,
  });
})

LiquidityHub.InstantRedeem.handler(async ({ event, context }) => {
  context.Action.set({
    id: makeId(event),
    address: event.params.recipient,
    actionType: "INSTANT_REDEEM",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn: qUSD.address,
    amountIn: event.params.assetAmount,
    tokenOut: USDC.address,
    amountOut: event.params.underlyingAmount,
  });
})

LiquidityHub.RedeemRequest.handler(async ({ event, context }) => {
  const redeemQueue = await getOrCreateRedeemQueue(context);

  context.RedeemQueue.set({
    ...redeemQueue,
    redeemsCount: redeemQueue.redeemsCount + 1,
    redeemAssets: redeemQueue.redeemAssets + event.params.assetAmount
  });
  context.RedeemRequest.set({
    id: `${event.params.redeemId}`,
    requestedAt: event.block.timestamp,
    requestTxHash: event.transaction.hash,
    redeemer: event.params.redeemer,
    recipient: event.params.recipient,
    assetAmount: event.params.assetAmount,
    isProcessed: false
  });
})


LiquidityHub.RedeemClaim.handler(async ({ event, context }) => {
  const redeemQueue = await getOrCreateRedeemQueue(context);
  const redeemRequest = await context.RedeemRequest.getOrThrow(`${event.params.redeemId}`)

  context.Action.set({
    id: makeId(event),
    address: event.params.recipient,
    actionType: "REDEEM",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn: qUSD.address,
    amountIn: asAssetAmount(event.params.underlyingAmount),
    tokenOut: USDC.address,
    amountOut: event.params.underlyingAmount,
  });
  context.RedeemQueue.set({
    ...redeemQueue,
    claimedRedeemsCount: redeemQueue.claimedRedeemsCount + 1,
    claimedRedeemAssets: redeemQueue.claimedRedeemAssets + redeemRequest.assetAmount
  });
  context.RedeemRequest.set({
    ...redeemRequest,
    isProcessed: true,
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
  const fromAddress = getAddress(event.params.from);
  if (fromAddress !== zeroAddress) {
    const fromBalance = await context.ShareBalance.getOrCreate({
      id: fromAddress,
      updatedAt: event.block.timestamp,
      amount: 0n,
      holdingStreakSeconds: 0
    });
    const amount = fromBalance.amount - event.params.amount;
    const holdingStreakSeconds = fromBalance.amount > 0
      ? fromBalance.holdingStreakSeconds + event.block.timestamp - fromBalance.updatedAt
      : 0;
    context.ShareBalance.set({
      id: fromAddress,
      updatedAt: event.block.timestamp,
      amount,
      holdingStreakSeconds,
    });
    context.ShareBalanceSnapshot.set({
      id: makeId(event),
      address: fromAddress,
      timestamp: event.block.timestamp,
      amount,
      holdingStreakSeconds,
    });
  }

  const toAddress = getAddress(event.params.to);
  if (toAddress !== zeroAddress) {
    const toBalance = await context.ShareBalance.getOrCreate({
      id: toAddress,
      updatedAt: event.block.timestamp,
      amount: 0n,
      holdingStreakSeconds: 0
    });
    const amount = toBalance.amount + event.params.amount;
    const holdingStreakSeconds = toBalance.amount > 0
      ? toBalance.holdingStreakSeconds + event.block.timestamp - toBalance.updatedAt
      : 0;
    context.ShareBalance.set({
      id: toAddress,
      updatedAt: event.block.timestamp,
      amount,
      holdingStreakSeconds,
    });
    context.ShareBalanceSnapshot.set({
      id: makeId(event),
      address: toAddress,
      timestamp: event.block.timestamp,
      amount,
      holdingStreakSeconds
    });
  }
});

QUSD.Transfer.handler(async ({ event, context }) => {
  const stats = await getOrCreateStats(context);
  let tvlDelta = 0n;

  const fromAddress = getAddress(event.params.from);
  if (fromAddress !== zeroAddress) {
    const fromBalance = await context.AssetBalance.getOrCreate({
      id: fromAddress,
      updatedAt: event.block.timestamp,
      amount: 0n,
      holdingStreakSeconds: 0
    });
    const amount = fromBalance.amount - event.params.amount;
    const holdingStreakSeconds = fromBalance.amount > 0
      ? fromBalance.holdingStreakSeconds + event.block.timestamp - fromBalance.updatedAt
      : 0;
    context.AssetBalance.set({
      id: fromAddress,
      updatedAt: event.block.timestamp,
      amount,
      holdingStreakSeconds,
    });
    context.AssetBalanceSnapshot.set({
      id: makeId(event),
      address: fromAddress,
      timestamp: event.block.timestamp,
      amount,
      holdingStreakSeconds,
    });
  } else {
    tvlDelta += event.params.amount;
  }

  const toAddress = getAddress(event.params.to);
  if (toAddress !== zeroAddress) {
    const toBalance = await context.AssetBalance.getOrCreate({
      id: toAddress,
      updatedAt: event.block.timestamp,
      amount: 0n,
      holdingStreakSeconds: 0
    });
    const amount = toBalance.amount + event.params.amount;
    const holdingStreakSeconds = toBalance.amount > 0
      ? toBalance.holdingStreakSeconds + event.block.timestamp - toBalance.updatedAt
      : 0;
    context.AssetBalance.set({
      id: toAddress,
      updatedAt: event.block.timestamp,
      amount,
      holdingStreakSeconds,
    });
    context.AssetBalanceSnapshot.set({
      id: makeId(event),
      address: toAddress,
      timestamp: event.block.timestamp,
      amount,
      holdingStreakSeconds
    });
  } else {
    tvlDelta -= event.params.amount;
  }

  if (tvlDelta !== 0n) {
    context.Stats.set({
      id: STATS_ID,
      tvl: stats.tvl + tvlDelta,
    })
    context.TvlSnapshotDaily.set({
      id: makeId(event),
      timestamp: event.block.timestamp,
      amount: stats.tvl + tvlDelta,
    })
  }
});

SqUSD.Deposit.handler(async ({ event, context }) => {
  context.Action.set({
    id: makeId(event),
    address: event.params.owner,
    actionType: "STAKE",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn: qUSD.address,
    amountIn: event.params.assets,
    tokenOut: sqUSD.address,
    amountOut: event.params.shares,
  });
})

SqUSD.Withdraw.handler(async ({ event, context }) => {
  context.Action.set({
    id: makeId(event),
    address: event.params.owner,
    actionType: "UNSTAKE",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    tokenIn: sqUSD.address,
    amountIn: event.params.assets,
    tokenOut: qUSD.address,
    amountOut: event.params.shares,
  });
})

Router.Deposit.handler(async ({ event, context }) => {
  if (!event.params.staked) return;

  const id = `${event.block.number}-${event.transaction.transactionIndex}-${event.logIndex - 4}`
  const action = await context.Action.getOrThrow(id)

  context.Action.set({
    ...action,
    address: event.params.user
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
    address: event.params.user
  })
  context.Action.deleteUnsafe(makeId(event))
})