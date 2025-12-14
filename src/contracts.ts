import { createPublicClient, http, getContract, erc4626Abi, erc20Abi } from "viem";
import { sepolia } from "viem/chains";

const client = createPublicClient({
    chain: sepolia,
    batch: { multicall: true }, // Enable multicall batching for efficiency
    transport: http(undefined, { batch: true }), // Thanks to automatic Effect API batching, we can also enable batching for Viem transport level
});

export const USDC = getContract({
    abi: erc20Abi,
    address: "0xf55B2Ab657147E94B228A2575483Ea3C73C88275",
    client,
})

export const qUSD = getContract({
    abi: erc20Abi,
    address: "0xB497C6e264Eb62f6Cc41eBE7c860678A3F198e6b",
    client,
})

export const sqUSD = getContract({
    abi: erc4626Abi,
    address: "0x16b0191DB14c73f1133a5D4C23127318Fe9a7852",
    client,
});