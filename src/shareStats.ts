import { createEffect, S } from "envio";
import { sqUSD } from "./contracts";

export const getTotalShares = createEffect(
    {
        name: "getTotalShares",
        input: {
            blockNumber: S.bigint,
        },
        output: S.bigint,
        cache: true,
        rateLimit: {
            calls: 5,
            per: "second",
        },
    },
    async ({ input }) => {
        const { blockNumber } = input;
        return await sqUSD.read.totalSupply({ blockNumber });
    }
);