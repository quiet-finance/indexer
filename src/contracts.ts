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
    address: "0x9581F368680aa05EBaA187022154eB055C808ad5",
    client,
})

export const sqUSD = getContract({
    abi: erc4626Abi,
    address: "0x4aBeD8353213656fda42406b9dA3d9CC3951Ae18",
    client,
});