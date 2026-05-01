/**
 * Z0tz Relayer — submits signed UserOperations to the EntryPoint.
 * Reused from Z0tz/relayer/lib/relayer.ts for Next.js API routes.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  concat,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex,
  type Chain,
} from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";
import { sepolia, arbitrumSepolia, baseSepolia } from "viem/chains";
import { makeTransport, primaryRpc } from "./rpc";

export interface UserOperation {
  sender: Address;
  nonce: string;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: string;
  gasFees: Hex;
  paymasterAndData: Hex;
  signature: Hex;
}

export interface RelayerConfig {
  relayerPrivateKey: Hex;
  /** Paymaster operator key (signs AA-6 sponsorship envelopes server-side). */
  paymasterOperatorKey?: Hex;
  rpcUrls: Record<number, string>;
  entryPointAddress: Address;
  allowedChains: number[];
  paymasterAddress?: Address;
  accountFactoryAddress?: Address;
  bridgeAddresses: Record<number, string>;
  paymasterAddresses: Record<number, string>;
  factoryAddresses: Record<number, string>;
}

export interface BridgeRequest {
  lockId: string;
  sender: string;
  amount: string;
  srcChainId: number;
  destChainId: number;
  destRecipient: string;
}

export interface PrivateBridgeRequest {
  lockId: string;
  amount: string;
  srcChainId: number;
  destChainId: number;
  recipient: string; // user's smart account on destination
  encryptedAmount: {
    ctHash: string;
    securityZone: number;
    utype: number;
    signature: string;
  };
}

export interface RelayResult {
  success: boolean;
  transactionHash?: Hex;
  error?: string;
}

const CHAINS: Record<number, Chain> = {
  11155111: sepolia,
  421614: arbitrumSepolia,
  84532: baseSepolia,
};

const BRIDGE_ABI = [
  {
    name: "locks",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "lockId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "srcChainId", type: "uint256" },
      { name: "srcLockId", type: "bytes32" },
    ],
    outputs: [{ name: "mintId", type: "bytes32" }],
  },
] as const;

const ENTRYPOINT_ABI = [
  {
    name: "handleOps",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "ops",
        type: "tuple[]",
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "accountGasLimits", type: "bytes32" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "gasFees", type: "bytes32" },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
      { name: "beneficiary", type: "address" },
    ],
    outputs: [],
  },
] as const;

export function loadConfigFromEnv(): RelayerConfig {
  const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY as Hex;
  if (!relayerPrivateKey) {
    throw new Error("RELAYER_PRIVATE_KEY not set");
  }

  const rpcUrls: Record<number, string> = {};
  const allowedChains = (process.env.ALLOWED_CHAINS ?? "11155111,421614,84532")
    .split(",")
    .map(Number);

  // Pull the primary URL from the ordered pool in ./rpc. Env-based overrides
  // (RPC_URL_{chainId}) still apply — resolvePool puts them in front.
  for (const chainId of allowedChains) {
    rpcUrls[chainId] = primaryRpc(chainId);
  }

  const bridgeAddresses: Record<number, string> = {};
  const paymasterAddresses: Record<number, string> = {};
  const factoryAddresses: Record<number, string> = {};
  const privateBridgeAddresses: Record<number, string> = {};
  for (const chainId of allowedChains) {
    const bridge = process.env[`BRIDGE_ADDRESS_${chainId}`];
    const paymaster = process.env[`PAYMASTER_ADDRESS_${chainId}`];
    const factory = process.env[`FACTORY_ADDRESS_${chainId}`];
    const privateBridge = process.env[`PRIVATE_BRIDGE_ADDRESS_${chainId}`];
    if (bridge) bridgeAddresses[chainId] = bridge;
    if (paymaster) paymasterAddresses[chainId] = paymaster;
    if (factory) factoryAddresses[chainId] = factory;
    if (privateBridge) privateBridgeAddresses[chainId] = privateBridge;
  }

  return {
    relayerPrivateKey,
    // Default to the relayer key when no separate operator key is set.
    // Option A (operator == relayer EOA on the paymaster): a single
    // RELAYER_PRIVATE_KEY satisfies both gas payment and AA-6 envelope
    // signing. Override with PAYMASTER_OPERATOR_KEY when running with a
    // separate operator key.
    paymasterOperatorKey: (process.env.PAYMASTER_OPERATOR_KEY as Hex | undefined) ?? relayerPrivateKey,
    rpcUrls,
    entryPointAddress: (process.env.ENTRYPOINT_ADDRESS ??
      "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108") as Address,
    allowedChains,
    paymasterAddress: process.env.PAYMASTER_ADDRESS as Address | undefined,
    accountFactoryAddress: process.env.ACCOUNT_FACTORY_ADDRESS as Address | undefined,
    bridgeAddresses,
    paymasterAddresses,
    factoryAddresses,
    privateBridgeAddresses,
  } as RelayerConfig;
}

/**
 * Sign the AA-6 sponsorship envelope for a UserOperation server-side.
 * The operator key never leaves the relayer (Vercel env var).
 *
 * Mirrors Z0tz/relayer/lib/relayer.ts:signEnvelope. The envelope hash
 * binds (userOp-without-paymaster-sig, feeCap, validUntil, validAfter,
 * chainId, paymasterAddr) — matching Z0tzPaymaster._hashUserOpForEnvelope.
 */
async function signEnvelope(
  userOp: UserOperation,
  chainId: number,
  operatorKey: Hex,
): Promise<UserOperation> {
  const pmd = userOp.paymasterAndData;
  if (!pmd || pmd === "0x" || pmd.length < 2 + 2 * (52 + 32 + 6 + 6 + 65)) {
    return userOp;
  }
  const pmdBytes = hexToBytes(pmd);
  const paymasterAddr = ("0x" + bytesToHex(pmdBytes.slice(0, 20))) as Address;
  const dataOffset = 52;
  const feeCap = bytesToBigInt(pmdBytes.slice(dataOffset, dataOffset + 32));
  const validUntil = Number(bytesToBigInt(pmdBytes.slice(dataOffset + 32, dataOffset + 38)));
  const validAfter = Number(bytesToBigInt(pmdBytes.slice(dataOffset + 38, dataOffset + 44)));
  const pmdNoSig = pmdBytes.slice(0, pmdBytes.length - 65);

  const inner = keccak256(encodeAbiParameters(
    parseAbiParameters("address,uint256,bytes32,bytes32,bytes32,uint256,bytes32,bytes32"),
    [
      userOp.sender,
      BigInt(userOp.nonce),
      keccak256(userOp.initCode),
      keccak256(userOp.callData),
      userOp.accountGasLimits,
      BigInt(userOp.preVerificationGas),
      userOp.gasFees,
      keccak256(("0x" + bytesToHex(pmdNoSig)) as Hex),
    ],
  ));
  const ENTRYPOINT = "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108" as Address;
  const paymasterHash = keccak256(encodeAbiParameters(
    parseAbiParameters("bytes32,address,uint256"),
    [inner, ENTRYPOINT, BigInt(chainId)],
  ));
  const envelope = keccak256(encodeAbiParameters(
    parseAbiParameters("bytes32,uint256,uint48,uint48,uint256,address"),
    [paymasterHash, feeCap, validUntil, validAfter, BigInt(chainId), paymasterAddr],
  ));
  const ethSigned = keccak256(concat([
    "0x19457468657265756d205369676e6564204d6573736167653a0a3332" as Hex,
    envelope,
  ]));
  const sigObj = await sign({ hash: ethSigned, privateKey: operatorKey });
  const sig65 = serializeSig65(sigObj);
  const newPmd = new Uint8Array(pmdBytes.length);
  newPmd.set(pmdBytes.slice(0, pmdBytes.length - 65));
  newPmd.set(sig65, pmdBytes.length - 65);
  return { ...userOp, paymasterAndData: ("0x" + bytesToHex(newPmd)) as Hex };
}

function serializeSig65(sig: { r: Hex; s: Hex; v?: bigint; yParity?: number }): Uint8Array {
  const r = hexToBytes(sig.r);
  const s = hexToBytes(sig.s);
  const yParity = sig.yParity ?? (sig.v !== undefined ? Number(sig.v) - 27 : 0);
  const v = 27 + (yParity & 1);
  const out = new Uint8Array(65);
  out.set(r, 0);
  out.set(s, 32);
  out[64] = v;
  return out;
}
function hexToBytes(hex: Hex | string): Uint8Array {
  const s = typeof hex === "string" && hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}
function bytesToBigInt(b: Uint8Array): bigint {
  return b.length === 0 ? 0n : BigInt("0x" + bytesToHex(b));
}

export function validateUserOp(
  userOp: UserOperation,
  config: RelayerConfig,
  chainId?: number,
): string | null {
  if (!userOp.sender || !userOp.sender.startsWith("0x")) {
    return "Invalid sender address";
  }
  if (!userOp.signature || userOp.signature === "0x") {
    return "Missing signature";
  }
  if (!userOp.callData) {
    return "Missing callData";
  }

  if (userOp.paymasterAndData && userOp.paymasterAndData !== "0x" && userOp.paymasterAndData.length >= 42) {
    const pmAddr = userOp.paymasterAndData.slice(0, 42).toLowerCase();
    const allowedPaymasters: string[] = [];
    if (chainId && config.paymasterAddresses[chainId]) {
      allowedPaymasters.push(config.paymasterAddresses[chainId].toLowerCase());
    }
    if (config.paymasterAddress) {
      allowedPaymasters.push(config.paymasterAddress.toLowerCase());
    }
    if (allowedPaymasters.length > 0 && !allowedPaymasters.includes(pmAddr)) {
      return `Unknown paymaster: ${pmAddr}`;
    }
  }

  return null;
}

export async function relayUserOp(
  userOp: UserOperation,
  chainId: number,
  config: RelayerConfig,
): Promise<RelayResult> {
  if (!config.allowedChains.includes(chainId)) {
    return { success: false, error: `Chain ${chainId} not supported` };
  }

  const rpcUrl = config.rpcUrls[chainId];
  if (!rpcUrl) {
    return { success: false, error: `No RPC URL for chain ${chainId}` };
  }

  const validationError = validateUserOp(userOp, config, chainId);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // AA-6 envelope: relayer signs server-side using PAYMASTER_OPERATOR_KEY.
  // Operator key never leaves the Vercel env. Skipped only if no operator
  // key is configured (legacy paymaster).
  if (config.paymasterOperatorKey) {
    userOp = await signEnvelope(userOp, chainId, config.paymasterOperatorKey);
  }

  const chain = CHAINS[chainId] ?? {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };

  const relayerAccount = privateKeyToAccount(config.relayerPrivateKey);

  const publicClient = createPublicClient({ chain, transport: makeTransport(rpcUrl) });
  const walletClient = createWalletClient({
    account: relayerAccount,
    chain,
    transport: makeTransport(rpcUrl),
  });

  try {
    const formattedOp = {
      sender: userOp.sender,
      nonce: BigInt(userOp.nonce),
      initCode: userOp.initCode,
      callData: userOp.callData,
      accountGasLimits: userOp.accountGasLimits,
      preVerificationGas: BigInt(userOp.preVerificationGas),
      gasFees: userOp.gasFees,
      paymasterAndData: userOp.paymasterAndData,
      signature: userOp.signature,
    };

    // Explicit outer-tx gas. Without this, viem calls eth_estimateGas on
    // handleOps; if the simulation reverts (common during initial deploys on
    // Base Sepolia where the account doesn't exist yet), some RPC nodes
    // return the block gas cap as the estimate and the tx is then rejected
    // with "exceeds the limit allowed for the block". 3M covers a P-256
    // passkey UserOp (preVerificationGas ~150K + verificationGasLimit ~500K
    // + callGasLimit ~300K + overhead + buffer) with headroom.
    const outerGas = BigInt(userOp.preVerificationGas) + 2_500_000n;
    const hash = await walletClient.writeContract({
      address: config.entryPointAddress,
      abi: ENTRYPOINT_ABI,
      functionName: "handleOps",
      args: [[formattedOp], relayerAccount.address],
      gas: outerGas < 3_000_000n ? 3_000_000n : outerGas,
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return { success: true, transactionHash: hash };
  } catch (error: unknown) {
    let msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("0x220266b6") || msg.includes("FailedOp")) {
      try {
        const match = msg.match(/0x220266b6[0-9a-fA-F]*/);
        if (match) {
          const { decodeErrorResult } = await import("viem");
          const decoded = decodeErrorResult({
            abi: [{
              type: "error",
              name: "FailedOp",
              inputs: [
                { name: "opIndex", type: "uint256" },
                { name: "reason", type: "string" },
              ],
            }],
            data: match[0] as `0x${string}`,
          });
          msg = `FailedOp: ${decoded.args?.[1] ?? "unknown reason"}`;
        }
      } catch {
        // Keep original
      }
    }

    return { success: false, error: msg.slice(0, 500) };
  }
}

export async function relayBridge(
  request: BridgeRequest,
  config: RelayerConfig,
): Promise<RelayResult> {
  const { lockId, amount, srcChainId, destChainId, destRecipient } = request;

  const srcBridgeAddr = config.bridgeAddresses?.[srcChainId];
  const destBridgeAddr = config.bridgeAddresses?.[destChainId];

  if (!srcBridgeAddr) return { success: false, error: `No bridge for chain ${srcChainId}` };
  if (!destBridgeAddr) return { success: false, error: `No bridge for chain ${destChainId}` };

  const srcRpcUrl = config.rpcUrls[srcChainId];
  const destRpcUrl = config.rpcUrls[destChainId];
  if (!srcRpcUrl || !destRpcUrl) return { success: false, error: "Missing RPC URL" };

  const srcChain = CHAINS[srcChainId] ?? { id: srcChainId, name: `chain-${srcChainId}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [srcRpcUrl] } } };
  const destChain = CHAINS[destChainId] ?? { id: destChainId, name: `chain-${destChainId}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [destRpcUrl] } } };

  const relayerAccount = privateKeyToAccount(config.relayerPrivateKey);

  // Verify lock on source
  const srcPublicClient = createPublicClient({ chain: srcChain, transport: makeTransport(srcRpcUrl) });
  try {
    const lockExists = await srcPublicClient.readContract({
      address: srcBridgeAddr as Address,
      abi: BRIDGE_ABI,
      functionName: "locks",
      args: [lockId as Hex],
    });
    if (!lockExists) return { success: false, error: "Lock does not exist on source chain" };
  } catch (error) {
    return { success: false, error: `Failed to verify lock: ${(error as Error).message?.slice(0, 300)}` };
  }

  // Mint on destination
  const destPublicClient = createPublicClient({ chain: destChain, transport: makeTransport(destRpcUrl) });
  const destWalletClient = createWalletClient({ account: relayerAccount, chain: destChain, transport: makeTransport(destRpcUrl) });

  try {
    const hash = await destWalletClient.writeContract({
      address: destBridgeAddr as Address,
      abi: BRIDGE_ABI,
      functionName: "mint",
      args: [destRecipient as Address, BigInt(amount), BigInt(srcChainId), lockId as Hex],
    });
    await destPublicClient.waitForTransactionReceipt({ hash });
    return { success: true, transactionHash: hash };
  } catch (error) {
    return { success: false, error: `Failed to mint: ${(error as Error).message?.slice(0, 300)}` };
  }
}

// Private bridge: mint + shield + encrypted transfer on destination
const PRIVATE_BRIDGE_ABI = [
  {
    name: "mintAndShield",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "srcChainId", type: "uint256" },
      { name: "srcLockId", type: "bytes32" },
      { name: "inTransferAmount", type: "tuple", components: [
        { name: "ctHash", type: "uint256" },
        { name: "securityZone", type: "uint8" },
        { name: "utype", type: "uint8" },
        { name: "signature", type: "bytes" },
      ]},
    ],
    outputs: [{ name: "mintId", type: "bytes32" }],
  },
] as const;

export async function relayPrivateBridge(
  request: PrivateBridgeRequest,
  config: RelayerConfig,
): Promise<RelayResult> {
  const { lockId, amount, srcChainId, destChainId, recipient, encryptedAmount } = request;

  const srcBridgeAddr = config.bridgeAddresses?.[srcChainId];
  const destPrivateBridgeAddr = (config as any).privateBridgeAddresses?.[destChainId];

  if (!srcBridgeAddr) return { success: false, error: `No bridge for source chain ${srcChainId}` };
  if (!destPrivateBridgeAddr) return { success: false, error: `No private bridge for dest chain ${destChainId}` };

  const srcRpcUrl = config.rpcUrls[srcChainId];
  const destRpcUrl = config.rpcUrls[destChainId];
  if (!srcRpcUrl || !destRpcUrl) return { success: false, error: "Missing RPC URL" };

  const srcChain = CHAINS[srcChainId] ?? { id: srcChainId, name: `chain-${srcChainId}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [srcRpcUrl] } } };
  const destChain = CHAINS[destChainId] ?? { id: destChainId, name: `chain-${destChainId}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [destRpcUrl] } } };

  const relayerAccount = privateKeyToAccount(config.relayerPrivateKey);

  // 1. Verify lock on source
  const srcPublicClient = createPublicClient({ chain: srcChain, transport: makeTransport(srcRpcUrl) });
  try {
    const lockExists = await srcPublicClient.readContract({
      address: srcBridgeAddr as Address,
      abi: BRIDGE_ABI,
      functionName: "locks",
      args: [lockId as Hex],
    });
    if (!lockExists) return { success: false, error: "Lock does not exist on source chain" };
  } catch (error) {
    return { success: false, error: `Failed to verify lock: ${(error as Error).message?.slice(0, 200)}` };
  }

  // 2. Call mintAndShield on destination PrivateBridge
  const destPublicClient = createPublicClient({ chain: destChain, transport: makeTransport(destRpcUrl) });
  const destWalletClient = createWalletClient({ account: relayerAccount, chain: destChain, transport: makeTransport(destRpcUrl) });

  try {
    const hash = await destWalletClient.writeContract({
      address: destPrivateBridgeAddr as Address,
      abi: PRIVATE_BRIDGE_ABI,
      functionName: "mintAndShield",
      args: [
        recipient as Address,
        BigInt(amount),
        BigInt(srcChainId),
        lockId as Hex,
        {
          ctHash: BigInt(encryptedAmount.ctHash),
          securityZone: encryptedAmount.securityZone,
          utype: encryptedAmount.utype,
          signature: encryptedAmount.signature as Hex,
        },
      ],
      gas: 2_000_000n,
    });
    await destPublicClient.waitForTransactionReceipt({ hash });
    return { success: true, transactionHash: hash };
  } catch (error) {
    return { success: false, error: `Failed to mintAndShield: ${(error as Error).message?.slice(0, 300)}` };
  }
}
