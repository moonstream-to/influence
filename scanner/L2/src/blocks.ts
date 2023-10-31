import { Contract, num, hash, RpcProvider } from "starknet";
import { Command } from "commander";
import fs from "fs";

import {
    MOONSTREAM_STARKNET_URI,
    STARKNET_INFLUENCE_ADALIANS_CONTRACT_ADDRESS,
    STARKNET_ADALIANS_ABI_PATH,
    BLOCKS_PER_FILE,
} from "./settings";
import {
    CrewmatePurchased,
    CrewmateRecruitedV1,
    CrewmateAttrMap,
} from "./data";
import path from "path";

async function fetchAndWriteBlock(
    provider: RpcProvider,
    blockNumber: number,
): Promise<void> {
    try {
        const block = await provider.getBlock(blockNumber);
        if (!block) {
            console.error(`Block #${blockNumber} not found`);
            return;
        }

        const dir = Math.floor(blockNumber / BLOCKS_PER_FILE);
        const dirPath = path.join(__dirname, "blocks", dir.toString());

        console.log(`Fetching block #${blockNumber}`);
        console.log(`Writing block #${blockNumber} to ${dirPath}`);

        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        const filePath = path.join(dirPath, `${blockNumber}.json`);
        fs.writeFileSync(filePath, JSON.stringify(block, null, 2));
        console.log(`Block #${blockNumber} written to ${filePath}`);
    } catch (error) {
        console.error(
            `Error fetching or writing block #${blockNumber}: ${error}`,
        );
    }
}

async function checkLatestBlockInFiles(): Promise<number | undefined> {
    let latestBlockNumber: number | undefined = undefined;

    const blocksDir = path.join(__dirname, "blocks");
    console.log(`Checking latest block in ${blocksDir}`);

    // check if blocks directory exists
    if (!fs.existsSync(blocksDir)) {
        console.log(`Directory ${blocksDir} does not exist`);
        // create blocks directory
        fs.mkdirSync(blocksDir, { recursive: true });
        console.log(`Directory ${blocksDir} created`);
        return latestBlockNumber;
    }

    const files = fs.readdirSync(blocksDir);
    console.log(`Found ${files.length} files`);

    for (const file of files) {
        const dirPath = path.join(blocksDir, file);
        const stat = fs.statSync(dirPath);

        if (!stat.isDirectory()) {
            continue;
        }

        const dir = parseInt(file);
        const dirFiles = fs.readdirSync(dirPath);

        for (const dirFile of dirFiles) {
            const filePath = path.join(dirPath, dirFile);
            const stat = fs.statSync(filePath);

            if (!stat.isFile()) {
                continue;
            }

            const blockNumber = parseInt(dirFile.split(".")[0]);
            if (
                latestBlockNumber === undefined ||
                blockNumber > latestBlockNumber
            ) {
                latestBlockNumber = blockNumber;
            }
        }
    }

    return latestBlockNumber;
}

async function startCrawling(
    provider: RpcProvider,
    startBlockNumber: number | undefined,
): Promise<void> {
    let lastBlockNumber = startBlockNumber;

    if (!lastBlockNumber || Number.isNaN(lastBlockNumber)) {
        lastBlockNumber = 0;
    }

    console.log(`Starting crawling from block #${lastBlockNumber}`);

    const currentBlockNumber = (await provider.getBlock("latest")).block_number;

    await checkLatestBlockInFiles().then((latestBlockNumber) => {
        if (
            latestBlockNumber !== undefined &&
            latestBlockNumber > lastBlockNumber
        ) {
            lastBlockNumber = latestBlockNumber;
        }
    });

    if (!lastBlockNumber || Number.isNaN(lastBlockNumber)) {
        lastBlockNumber = 0;
    }

    while (true) {
        console.log(
            `Crawling from block #${
                lastBlockNumber + 1
            } to block #${currentBlockNumber}`,
        );

        for (let i = lastBlockNumber + 1; i <= currentBlockNumber; i++) {
            await fetchAndWriteBlock(provider, i);
            lastBlockNumber = i;
        }

        await new Promise((resolve) => setTimeout(resolve, 10000));
    }
}

export default startCrawling;
