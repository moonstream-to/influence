export const STARKNET_ADALIANS_CONTRACT_ADDRESS =
    process.env.STARKNET_ADALIANS_CONTRACT_ADDRESS;
if (!STARKNET_ADALIANS_CONTRACT_ADDRESS) {
    throw new Error(
        "Unable to read env variable STARKNET_ADALIANS_CONTRACT_ADDRESS",
    );
}
export let STARKNET_ADALIANS_ABI_PATH = process.env.STARKNET_ADALIANS_ABI_PATH;
if (!STARKNET_ADALIANS_ABI_PATH) {
    STARKNET_ADALIANS_ABI_PATH = "./abi/AdaliansAbi-Custom.json";
}

export const WEB3_INFURA_URL = process.env.WEB3_INFURA_URL;
if (!WEB3_INFURA_URL) {
    throw new Error("Unable to read env variable WEB3_INFURA_URL");
}
