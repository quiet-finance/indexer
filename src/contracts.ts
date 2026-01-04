import { createPublicClient, http, getContract, erc4626Abi, erc20Abi, parseAbi } from "viem";
import { multicall } from "viem/actions";
import { sepolia } from "viem/chains";

export const client = createPublicClient({
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
    address: "0xF1f46532C08E8Fe1fd431Fe15f8a206b1838EE12",
    client,
})

const [usdcAddress, qUSDAddress, sqUSDAddress] = await multicall(client, {
    contracts: [
        { ...liquidityHub, functionName: "underlying" },
        { ...liquidityHub, functionName: "asset" },
        { ...liquidityHub, functionName: "vault" },
    ],
    allowFailure: false
})

export const USDC = getContract({
    abi: erc20Abi,
    address: usdcAddress,
    client,
})

export const qUSD = getContract({
    abi: erc20Abi,
    address: qUSDAddress,
    client,
})

export const sqUSD = getContract({
    abi: erc4626Abi,
    address: sqUSDAddress,
    client,
});