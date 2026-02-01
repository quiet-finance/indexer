import { createEffect, S } from "envio";
import { client, tokens } from "./contracts";
import { multicall } from "viem/actions";
import { BigDecimal } from "generated";

export const getVaultStats = createEffect(
    {
        name: "getVaultStats",
        input: {
            blockNumber: S.bigint,
        },
        output: {
            stakedAssets: S.bigDecimal,
            totalShares: S.bigDecimal,
        },
        cache: true,
        rateLimit: {
            calls: 5,
            per: "second",
        },
    },
    async ({ input }) => {
        const { blockNumber } = input;

        const [totalAssets, totalSupply] = await multicall(client, {
            contracts: [
                { ...tokens.sqUSD, functionName: "totalAssets" },
                { ...tokens.sqUSD, functionName: "totalSupply" },
            ],
            blockNumber,
            allowFailure: false,
        });

        const denom = new BigDecimal(10).pow(18);

        return {
            stakedAssets: new BigDecimal(totalAssets.toString()).div(denom),
            totalShares: new BigDecimal(totalSupply.toString()).div(denom),
        }
    }
);