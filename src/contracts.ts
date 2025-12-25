import { createPublicClient, http, getContract, erc4626Abi, erc20Abi, parseAbi } from "viem";
import { sepolia } from "viem/chains";

const client = createPublicClient({
    chain: sepolia,
    batch: { multicall: true },
    transport: http(undefined, { batch: true }),
});

export const liquidityHub = getContract({
    abi: parseAbi([
        "function underlying() external view returns (address)",
        "function asset() external view returns (address)",
        "function vault() external view returns (address)",
    ]),
    address: "0xEe1047a2CEDb1aFc42ECd088DCBAAcD9f06529B4",
    client,
})

export const USDC = getContract({
    abi: erc20Abi,
    address: await liquidityHub.read.underlying(),
    client,
})

export const qUSD = getContract({
    abi: erc20Abi,
    address: await liquidityHub.read.asset(),
    client,
})

export const sqUSD = getContract({
    abi: erc4626Abi,
    address: await liquidityHub.read.vault(),
    client,
});