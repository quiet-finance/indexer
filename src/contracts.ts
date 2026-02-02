import { indexer, BigDecimal } from "generated";
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
    address: "0x0291984a993A15dCb3dDADcE8E4B7eD83E375867",
    client,
});

const usdcAddress = indexer.chains.sepolia.USDC.addresses[0]!;
const qUSDAddress = indexer.chains.sepolia.QUSD.addresses[0]!;
const sqUSDAddress = indexer.chains.sepolia.SQUSD.addresses[0]!;

const USDC = getContract({
    abi: erc20Abi,
    address: usdcAddress,
    client,
});
export const parseUsdcAmount = (amount: bigint) =>
    new BigDecimal(amount.toString()).div(new BigDecimal(10).pow(6));

const qUSD = getContract({
    abi: erc20Abi,
    address: qUSDAddress,
    client,
});
export const parseQusdAmount = (amount: bigint) =>
    new BigDecimal(amount.toString()).div(new BigDecimal(10).pow(18));

const sqUSD = getContract({
    abi: [...erc4626Abi, ...erc20Abi],
    address: sqUSDAddress,
    client,
});
export const parseSqusdAmount = (amount: bigint) =>
    new BigDecimal(amount.toString()).div(new BigDecimal(10).pow(18));

export const tokens = {
    USDC,
    qUSD,
    sqUSD,
}