import {
  LiquidityHub,
  Rebalance,
  SqUSD,
  EventLog,
  Router
} from "generated";
import { getTotalShares } from "./shareStats";
import { getAddress, zeroAddress } from "viem";
import { USDC, qUSD, sqUSD } from "./contracts";
import { HandlerContext } from "generated/src/Types";

const REDEEM_QUEUE_ID = "REDEEM_QUEUE_ID"
const STARTED_REBALANCE_ID = "STARTED_REBALANCE_ID"

const makeId = (event: EventLog<{}>) => `${event.block.number}-${event.transaction.transactionIndex}-${event.logIndex}`
const asAssetAmount = (underlyingAmount: bigint) => underlyingAmount * (10n ** 12n);

const getOrCreateRedeemQueue = async (context: HandlerContext) => await context.RedeemQueue.getOrCreate({
  id: REDEEM_QUEUE_ID,
  redeemsCount: 0,
  processedRedeemsCount: 0,
  redeemAssets: 0n,
  processedRedeemAssets: 0n,
});

LiquidityHub.RebalanceStarted.handler(async ({ event, context }) => {
  context.Rebalance.set({
    id: STARTED_REBALANCE_ID,
    timestamp: undefined,
    deployedAssetsBefore: event.params.deployedAssets,
    startRebalanceTxHash: event.transaction.hash,
    deployedAssetsAfter: undefined,
    endRebalanceTxHash: undefined,
    totalShares: undefined,
  });
});

LiquidityHub.RebalanceFinished.handler(async ({ event, context }) => {
  const totalShares = await context.effect(getTotalShares, { blockNumber: BigInt(event.block.number) });
  const startedRebalance = await context.Rebalance.getOrThrow(STARTED_REBALANCE_ID);

  context.Rebalance.set({
    ...startedRebalance,
    id: makeId(event),
    timestamp: event.block.timestamp,
    deployedAssetsAfter: event.params.deployedAssets,
    endRebalanceTxHash: event.transaction.hash,
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
    id: `${event.params.requestId}`,
    requestedAt: event.block.timestamp,
    requestTxHash: event.transaction.hash,
    redeemer: event.params.redeemer,
    recipient: event.params.recipient,
    amount: event.params.assetAmount,
    isProcessed: false
  });
})


LiquidityHub.Redeem.handler(async ({ event, context }) => {
  const redeemQueue = await getOrCreateRedeemQueue(context);
  const redeemRequest = await context.RedeemRequest.getOrThrow(`${event.params.requestId}`)

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
    processedRedeemsCount: redeemQueue.processedRedeemsCount + 1,
    processedRedeemAssets: redeemQueue.processedRedeemAssets + asAssetAmount(event.params.underlyingAmount)
  });
  context.RedeemRequest.set({
    ...redeemRequest,
    isProcessed: true,
  })
})

SqUSD.Transfer.handler(async ({ event, context }) => {
  const fromAddress = getAddress(event.params.from);
  if (fromAddress !== zeroAddress) {
    const fromBalance = await context.ShareBalance.get(fromAddress);
    context.ShareBalance.set({
      id: fromAddress,
      updatedAt: event.block.timestamp,
      amount: (fromBalance?.amount ?? 0n) - event.params.amount
    });
    context.ShareBalanceSnapshot.set({
      id: makeId(event),
      address: fromAddress,
      timestamp: event.block.timestamp,
      amount: (fromBalance?.amount ?? 0n) - event.params.amount
    });
  }

  const toAddress = getAddress(event.params.to);
  if (toAddress !== zeroAddress) {
    const toBalance = await context.ShareBalance.get(toAddress);
    context.ShareBalance.set({
      id: toAddress,
      updatedAt: event.block.timestamp,
      amount: (toBalance?.amount ?? 0n) + event.params.amount
    });
    context.ShareBalanceSnapshot.set({
      id: makeId(event),
      address: toAddress,
      timestamp: event.block.timestamp,
      amount: (toBalance?.amount ?? 0n) + event.params.amount
    });
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