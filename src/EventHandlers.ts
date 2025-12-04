import {
  LiquidityHub,
  Rebalance,
  SqUSD,
  EventLog
} from "generated";
import { getTotalShares } from "./shareStats";
import { getAddress, zeroAddress } from "viem";
import { USDC, qUSD, sqUSD } from "./contracts";
import { HandlerContext } from "generated/src/Types";

const REDEEM_QUEUE_ID = "REDEEM_QUEUE_ID"

const makeId = (event: EventLog<{}>) => `${event.block.number}-${event.transaction.transactionIndex}-${event.logIndex}`

const asReceiptAmount = (assetAmount: bigint) => assetAmount * (10n ** 12n);

const getOrCreateRedeemQueue = async (context: HandlerContext) => await context.RedeemQueue.getOrCreate({
  id: REDEEM_QUEUE_ID,
  requestsTotal: 0,
  requestsProcessed: 0,
  amountTotal: 0n,
  amountProcessed: 0n,
});


LiquidityHub.RebalanceFinished.handler(async ({ event, context }) => {
  let totalShares;
  try {
    totalShares = await context.effect(getTotalShares, { blockNumber: BigInt(event.block.number) });
  } catch (error) {
    context.log.error("Failed to fetch total shares", {
      err: error,
    });
    return;
  }

  const entity: Rebalance = {
    id: makeId(event),
    timestamp: event.block.timestamp,
    oldNav: event.params.navBeforeRebalance,
    newNav: event.params.newNav,
    totalShares,
  };
  context.Rebalance.set(entity);
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
    amountIn: event.params.assetAmount,
    tokenOut: qUSD.address,
    amountOut: event.params.receiptAmount,
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
    amountIn: event.params.receiptAmount,
    tokenOut: USDC.address,
    amountOut: event.params.assetAmount,
  });
})

LiquidityHub.RedeemRequest.handler(async ({ event, context }) => {
  const redeemQueue = await getOrCreateRedeemQueue(context);

  context.RedeemQueue.set({
    ...redeemQueue,
    requestsTotal: redeemQueue.requestsTotal + 1,
    amountTotal: redeemQueue.amountTotal + event.params.receiptAmount
  });
  context.RedeemRequest.set({
    id: `${event.params.requestId}`,
    requestedAt: event.block.timestamp,
    requestTxHash: event.transaction.hash,
    redeemer: event.params.redeemer,
    recipient: event.params.recipient,
    amount: event.params.receiptAmount,
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
    amountIn: asReceiptAmount(event.params.assetAmount),
    tokenOut: USDC.address,
    amountOut: event.params.assetAmount,
  });
  context.RedeemQueue.set({
    ...redeemQueue,
    requestsProcessed: redeemQueue.requestsProcessed + 1,
    amountProcessed: redeemQueue.amountProcessed + asReceiptAmount(event.params.assetAmount)
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