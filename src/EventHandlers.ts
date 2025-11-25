import {
  LiquidityHub,
  Rebalance,
  SqUSD,
  EventLog
} from "generated";
import { getTotalShares } from "./sqUSDStats";
import { getAddress, zeroAddress } from "viem";

const makeId = (event: EventLog<{}>) => `${event.chainId}_${event.block.number}_${event.logIndex}`

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

SqUSD.Transfer.handler(async ({ event, context }) => {
  const fromAddress = getAddress(event.params.from);
  if (fromAddress !== zeroAddress) {
    const fromBalance = await context.SharesBalance.get(fromAddress);
    context.SharesBalance.set({
      id: fromAddress,
      updated_at: event.block.timestamp,
      amount: (fromBalance?.amount ?? 0n) - event.params.amount
    })
    context.SharesBalanceSnapshot.set({
      id: makeId(event),
      address: fromAddress,
      timestamp: event.block.timestamp,
      amount: (fromBalance?.amount ?? 0n) - event.params.amount
    })
  }

  const toAddress = getAddress(event.params.to);
  if (toAddress !== zeroAddress) {
    const toBalance = await context.SharesBalance.get(toAddress);
    context.SharesBalance.set({
      id: toAddress,
      updated_at: event.block.timestamp,
      amount: (toBalance?.amount ?? 0n) + event.params.amount
    })
    context.SharesBalanceSnapshot.set({
      id: makeId(event),
      address: toAddress,
      timestamp: event.block.timestamp,
      amount: (toBalance?.amount ?? 0n) + event.params.amount
    })
  }
});