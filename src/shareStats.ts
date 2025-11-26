import { createPublicClient, http, erc20Abi, getContract } from "viem";
import { sepolia } from "viem/chains";
import { createEffect, S } from "envio";

const client = createPublicClient({
    chain: sepolia,
    batch: { multicall: true }, // Enable multicall batching for efficiency
    transport: http(undefined, { batch: true }), // Thanks to automatic Effect API batching, we can also enable batching for Viem transport level
});

const sqUSD = getContract({
    abi: erc20Abi,
    address: "0x71F9244a5E41586e718F55cb2f1303c8D3971c4d",
    client: client,
});


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