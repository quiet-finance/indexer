import { createEffect, S } from "envio";
import { client, qUSD, sqUSD } from "./contracts";
import { multicall } from "viem/actions";

export const getVaultStats = createEffect(
    {
        name: "getVaultStats",
        input: {
            blockNumber: S.bigint,
        },
        output: {
            stakedAssets: S.bigint,
            totalShares: S.bigint,
        },
        cache: true,
        rateLimit: {
            calls: 5,
            per: "second",
        },
    },
    async ({ input }) => {
        const { blockNumber } = input;

        const [stakedAssets, totalShares] = await multicall(client, {
            contracts: [
                { ...sqUSD, functionName: "totalAssets" },
                { ...sqUSD, functionName: "totalSupply" },
            ],
            blockNumber,
            allowFailure: false,
        });

        return { stakedAssets, totalShares }
    }
);