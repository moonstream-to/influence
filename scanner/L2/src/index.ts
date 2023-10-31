import { Contract, num, hash, RpcProvider } from "starknet";
import { Command } from "commander";
import fs from "fs";

import {
    MOONSTREAM_STARKNET_URI,
    STARKNET_INFLUENCE_ADALIANS_CONTRACT_ADDRESS,
    STARKNET_ADALIANS_ABI_PATH,
    MOONSTREAM_LEADERBOARD_INFLUENCE_USER_ACCESS_TOKEN,
} from "./settings";
import {
    CrewmatePurchased,
    CrewmateRecruitedV1,
    CrewmateAttrMap,
    LeaderBoard,
    LeaderBoardDict,
} from "./data";
import startCrawling from "./blocks";

const providerRPC = new RpcProvider({ nodeUrl: MOONSTREAM_STARKNET_URI });

// InitializeContract create contract instance with specified address and ABI
const InitializeContract = (address: string, abiPath: string): Contract => {
    const abi = fs.readFileSync(abiPath, "utf8");
    const contract = new Contract(JSON.parse(abi), address, providerRPC);

    return contract;
};

const program = new Command();

program.version("0.0.1");

const NumberToAsciiString = (num) => {
    // Convert to hex
    let hexStr = num.toString(16);
    let result = "";
    for (let i = 0; i < hexStr.length; i += 2) {
        let hexByte = hexStr.slice(i, i + 2);
        // Convert hex byte to character
        let char = String.fromCharCode(parseInt(hexByte, 16));
        result += char;
    }
    return result;
};

async function updateLeaderboardScore(
    leaderboard_id: string,
    scores: LeaderBoard[],
) {
    const url = `https://engineapi.moonstream.to/leaderboard/${leaderboard_id}/scores?overwrite=true&normalize_addresses=false`;

    console.log("response", scores);

    const response = await fetch(url, {
        method: "PUT",
        headers: {
            Authorization: `Moonstream ${MOONSTREAM_LEADERBOARD_INFLUENCE_USER_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(scores),
    });

    if (!response.ok) {
        console.error(`Error: ${response.statusText}`);
        return;
    }

    console.log("Leaderboard updated");
    console.log(
        `Look at it here: https://moonstream.to/leaderboards/?leaderboard_id=${leaderboard_id}`,
    );
}

const EventParser = (
    eventType: string,
    blockNumber: number,
    txHash: string,
    blockHash: string,
    record: object,
): CrewmatePurchased | CrewmateRecruitedV1 => {
    let parsedData: CrewmatePurchased | CrewmateRecruitedV1;
    if (eventType == "CrewmatePurchased") {
        parsedData = {
            block_number: blockNumber,
            block_timestamp: undefined,
            block_hash: blockHash,
            transaction_hash: txHash,

            crewmate: {
                label: record["crewmate.label"].toString(16),
                id: record["crewmate.id"].toString(),
            },
            caller: "0x" + record["caller"].toString(16),
        };
    } else if (eventType == "CrewmateRecruitedV1") {
        let impactful = [];
        record["impactful"].forEach((i) => {
            impactful.push(i.toString());
        });
        let cosmetic = [];
        record["cosmetic"].forEach((i) => {
            cosmetic.push(i.toString());
        });
        let composition = [];
        record["composition"].forEach((i) => {
            composition.push(i.toString());
        });

        parsedData = {
            block_number: blockNumber,
            block_timestamp: undefined,
            block_hash: blockHash,
            transaction_hash: txHash,

            crewmate: {
                label: record["crewmate.label"].toString(16),
                id: record["crewmate.id"].toString(),
            },
            collection: record["collection"].toString(16),
            class: record["class"].toString(16),
            title: record["title"].toString(16),
            impactful: impactful,
            cosmetic: cosmetic,
            gender: record["gender"].toString(16),
            body: record["body"].toString(16),
            face: record["face"].toString(16),
            hair: record["hair"].toString(16),
            hair_color: record["hair_color"].toString(16),
            clothes: record["clothes"].toString(16),
            head: record["head"].toString(16),
            item: record["item"].toString(16),
            name: NumberToAsciiString(record["name"]),
            station: {
                label: record["station.label"].toString(16),
                id: record["station.id"].toString(),
            },
            composition: composition,
            caller_crew: {
                label: record["caller_crew.label"].toString(16),
                id: record["caller_crew.id"].toString(),
            },
            caller: "0x" + record["caller"].toString(16),
        };
    } else {
        throw new Error(`Unparsable event ${eventType}`);
    }

    return parsedData;
};

// https://www.starknetjs.com/docs/guides/events
const events = program
    .command("events")
    .description("Fetch events from Starknet");

const blocks = program
    .command("blocks")
    .description("Fetch blocks from Starknet");

blocks
    .command("crawl")
    .option(
        "--from-block <block_number>",
        "Parse from specified block number to latest",
    )
    .action(async (cmd) => {
        console.log("cmd.fromBlock", cmd.fromBlock);
        await startCrawling(providerRPC, cmd.fromBlock);
    });

const leaderboard = program
    .command("leaderboard")
    .description("CLI for Moonstream leaderboard");

leaderboard
    .command("generate")
    .option("--input <path>", "Path to input file with data")
    .option("--leaderboard-id <id>", "Leaderboard ID")
    .option("--event-filter <name>", "Filter events by name")
    .action(async (cmd) => {
        if (!cmd.input || !cmd.leaderboardId || !cmd.eventFilter) {
            console.log("cmd.input", cmd.input);
            console.log("cmd.leaderboard_id", cmd.leaderboardId);
            console.log("cmd.eventFilter", cmd.eventFilter);
            throw new Error("Input with data file should be specified");
        }

        if (!AVAILABLE_ADALIANS_EVENTS.includes(cmd.eventFilter)) {
            throw new Error(`Unsupported event ${cmd.eventFilter}`);
        }

        if (!MOONSTREAM_LEADERBOARD_INFLUENCE_USER_ACCESS_TOKEN) {
            throw new Error(
                "Unable to read env variable MOONSTREAM_LEADERBOARD_INFLUENCE_USER_ACCESS_TOKEN",
            );
        }

        const dataJson = fs.readFileSync(cmd.input, "utf8");
        const data = JSON.parse(dataJson);

        let leaderboardData: LeaderBoard[] = [];
        let positions_data: LeaderBoardDict = {};
        data.forEach((i) => {
            if (cmd.eventFilter == "CrewmateRecruitedV1") {
                if ("class" in i) {
                    // check if caller is already in positions_data
                    let character_class = CrewmateAttrMap["class"][i["class"]];
                    if (character_class in positions_data) {
                        positions_data[character_class]["score"]++;
                    } else {
                        positions_data[character_class] = {
                            score: 1,
                            points_data: {},
                        };
                    }
                }
            } else if (cmd.eventFilter == "CrewmatePurchased") {
                if (!("class" in i)) {
                    // check if caller is already in positions_data
                    let caller = i["caller"];

                    if (caller in positions_data) {
                        positions_data[caller]["score"]++;
                    } else {
                        positions_data[caller] = {
                            score: 1,
                            points_data: {},
                        };
                    }
                }
            }
        });

        // transform positions_data to leaderboardData

        Object.keys(positions_data).forEach((i) => {
            leaderboardData.push({
                address: i,
                score: positions_data[i]["score"],
                points_data: positions_data[i]["points_data"],
            });
        });

        await updateLeaderboardScore(cmd.leaderboardId, leaderboardData);
    });

const AVAILABLE_ADALIANS_EVENTS = ["CrewmatePurchased", "CrewmateRecruitedV1"];

const find_block_deployment_of_contract = async (address: string) => {
    let maxBlock = (await providerRPC.getBlock("latest")).block_number;
    let minBlock: number = 1;
    let midBlock = (minBlock + maxBlock) / 2;
    const isDeployed = {};

    const isDeployedAtBlock = await ContractExistsAtBlock(address, maxBlock);
    if (!isDeployedAtBlock) {
        return 0;
    }
    isDeployed[maxBlock] = isDeployedAtBlock;
    isDeployed[minBlock] = await ContractExistsAtBlock(address, minBlock);
    isDeployed[midBlock] = await ContractExistsAtBlock(address, midBlock);
    while (maxBlock - minBlock >= 2) {
        if (!isDeployed[minBlock] && !isDeployed[midBlock]) {
            minBlock = midBlock;
        } else {
            maxBlock = midBlock;
        }
        midBlock = (minBlock + maxBlock) / 2;
        midBlock = Math.floor(midBlock);
        isDeployed[midBlock] = await ContractExistsAtBlock(address, midBlock);
    }
    if (isDeployed[minBlock]) {
        return minBlock;
    }
    return maxBlock;
};

const ContractExistsAtBlock = async (address: string, blockNumber: number) => {
    console.log("blockNumber", blockNumber);
    console.log("address", address);

    let classHash;

    try {
        classHash = await providerRPC.getClassHashAt(address, blockNumber);
    } catch (e) {
        return false;
    }
    if (classHash === undefined) {
        return false;
    }
    return true;
};

const add_to_file_with_deduplication = (events, output) => {
    // check if file exists

    if (!fs.existsSync(output)) {
        fs.writeFileSync(output, JSON.stringify(events));
        return;
    }

    const file = fs.readFileSync(output, "utf8");

    const fileEvents = JSON.parse(file);

    // deduplication works over block_number and transaction_hash
    // dictionary of block_number: {transaction_hash: event}

    const fileEventsDict = {};
    fileEvents.forEach((event) => {
        if (fileEventsDict[event.block_number] === undefined) {
            fileEventsDict[event.block_number] = {};
        }
        fileEventsDict[event.block_number][event.transaction_hash] = event;
    });

    if (events.length === 0) {
        return;
    }

    events.forEach((event) => {
        if (fileEventsDict[event.block_number] === undefined) {
            // add event to file
            fileEvents.push(event);
        } else if (
            fileEventsDict[event.block_number][event.transaction_hash] ===
            undefined
        ) {
            // add event to file
            fileEvents.push(event);
        } else {
            // do nothing
        }
    });

    fs.writeFileSync(output, JSON.stringify(fileEvents));
};

events
    .command("watch")
    .option("--output <path>", "Path to output file")
    .action(async (cmd) => {
        if (!cmd.output) {
            throw new Error("Output file should be specified");
        }

        const adaliansContract = InitializeContract(
            STARKNET_INFLUENCE_ADALIANS_CONTRACT_ADDRESS,
            STARKNET_ADALIANS_ABI_PATH,
        );
        const nameHash = num.toHex(hash.starknetKeccak("CrewmatePurchased"));
        const nameHash2 = num.toHex(hash.starknetKeccak("CrewmateRecruitedV1"));
        const eventCrawlJobs = [
            {
                name: "CrewmatePurchased",
                keys: [nameHash],
            },
            {
                name: "CrewmateRecruitedV1",
                keys: [nameHash2],
            },
        ];
        //const testHashes = [nameHash, nameHash2];
        // join keys

        const eventCrawlJobsHashes = eventCrawlJobs.map((i) => i.keys[0]);

        const functionCallCrawlJobs = [];
        var startBlock = await find_block_deployment_of_contract(
            STARKNET_INFLUENCE_ADALIANS_CONTRACT_ADDRESS,
        );
        const maxBlocksBatch = 10000;
        const minBlocksBatch = 1;
        const confirmations = 60;
        const minSleepTime = 0.1;
        const logger = console;
        logger.info(
            `Starting continuous event crawler start_block=${startBlock}`,
        );
        const blocksCache = {};

        const latestBlock = await providerRPC.getBlock("latest");

        let currentSleepTime = minSleepTime;
        let failedCount = 0;
        while (true) {
            try {
                await new Promise((r) =>
                    setTimeout(r, currentSleepTime * 1000),
                );
                const endBlock = Math.min(
                    (await providerRPC.getBlock("latest")).block_number -
                        confirmations,
                    startBlock + maxBlocksBatch,
                );

                if (startBlock + minBlocksBatch > endBlock) {
                    currentSleepTime += 0.1;
                    logger.info(
                        `Sleeping for ${currentSleepTime} seconds because of low block count`,
                    );
                    continue;
                }
                currentSleepTime = Math.max(
                    minSleepTime,
                    currentSleepTime - 0.1,
                );
                logger.info(
                    `Crawling events from ${startBlock} to ${endBlock}`,
                );
                console.log("eventCrawlJobs", eventCrawlJobs);

                let chunkNum = 1;
                let events = [];
                const allEvents = { events: [] };

                let continuationToken = undefined;

                let keepGoing = true;

                while (keepGoing) {
                    console.log("continuationToken", continuationToken);
                    const eventsRes = await providerRPC.getEvents({
                        from_block: {
                            block_number: startBlock,
                        },
                        to_block: {
                            block_number: endBlock,
                        },
                        address: STARKNET_INFLUENCE_ADALIANS_CONTRACT_ADDRESS,
                        // keys [[num.toHex(hash.starknetKeccak("EventPanic")), "0x8"]] as example
                        keys: [eventCrawlJobsHashes],
                        chunk_size: 1000,
                        continuation_token: continuationToken,
                    });

                    console.log("eventsRes", eventsRes.events.length);

                    eventsRes.events.forEach(async (i) => {
                        let block_timestamp;
                        let block;

                        // getBlock
                        if (i["block_number"] in blocksCache) {
                            block_timestamp = blocksCache[i["block_number"]];
                        } else {
                            block = await providerRPC.getBlock(
                                i["block_number"],
                            );
                            block_timestamp = block.timestamp;
                            blocksCache[i["block_number"]] = block_timestamp;
                        }

                        // Method .parseEvents requires different structure then from .getEvents
                        const parsedEvent = adaliansContract.parseEvents({
                            actual_fee: "",
                            events: [i],
                            execution_status: "",
                            finality_status: "",
                            messages_sent: [],
                            transaction_hash: "",
                        });

                        const name = Object.keys(parsedEvent[0])[0];
                        const record = parsedEvent[0][name];
                        const parsedData = EventParser(
                            name,
                            i["block_number"],
                            i["transaction_hash"],
                            i["block_hash"],
                            record,
                        );
                        parsedData["block_timestamp"] = block.timestamp;
                        events.push(parsedData);
                    });

                    const nbEvents = eventsRes.events.length;
                    continuationToken = eventsRes.continuation_token;
                    console.log(
                        "chunk nb =",
                        chunkNum,
                        ".",
                        nbEvents,
                        "events crawled.",
                    );
                    console.log("continuation_token =", continuationToken);
                    chunkNum++;

                    add_to_file_with_deduplication(events, cmd.output);

                    if (!continuationToken) {
                        keepGoing = false;
                    }
                }
                logger.info(
                    `Crawled ${allEvents.events.length} events from ${startBlock} to ${endBlock}.`,
                );
                logger.info(
                    `Crawling function calls from ${startBlock} to ${endBlock}`,
                );
                logger.info(
                    `Crawled ${allEvents.events.length} function calls from ${startBlock} to ${endBlock}.`,
                );
                startBlock = endBlock + 1;
                failedCount = 0;
            } catch (e) {
                logger.error(`Internal error: ${e}`);
                logger.error(e);
                failedCount += 1;
                if (failedCount > 10) {
                    logger.error("Too many failures, exiting");
                    throw e;
                }
            }
        }
    });

events
    .command("standalone")
    .description("Fetch events in single transaction")
    .option("--tx <tx_hash>", "Transaction hash")
    .option(
        "--event-filter <name>",
        `Filter events by name (available options: ${AVAILABLE_ADALIANS_EVENTS}`,
    )
    .action(async (cmd) => {
        if (!cmd.tx) {
            throw new Error("Transaction hash should be specified");
        }
        let txReceipt = await providerRPC.getTransactionReceipt(cmd.tx);
        const listEvents = txReceipt.events;

        if (!AVAILABLE_ADALIANS_EVENTS.includes(cmd.eventFilter)) {
            throw new Error(`Unsupported event ${cmd.eventFilter}`);
        }
        const nameHash = num.toHex(hash.starknetKeccak(cmd.eventFilter));
        const filteredEvents = listEvents.filter(
            (item) => item.keys.length === 1 && item.keys[0] === nameHash,
        );
        txReceipt.events = filteredEvents;

        const adaliansContract = InitializeContract(
            STARKNET_INFLUENCE_ADALIANS_CONTRACT_ADDRESS,
            STARKNET_ADALIANS_ABI_PATH,
        );
        const parsedEvents = adaliansContract.parseEvents(txReceipt);
        const parsedData = EventParser(
            cmd.eventFilter,
            undefined,
            undefined,
            undefined,
            parsedEvents[0][cmd.eventFilter],
        );
        console.log(parsedData);
        return;
    });

events
    .command("adalians")
    .description("Fetch events CrewmatePurchased of Adalians")
    .option(
        "--from-block <block_number>",
        "Parse from specified block number to latest",
    )
    .option("--output <path>", "Path to output file")
    .option(
        "--event-filter <name>",
        `Filter events by name (available options: ${AVAILABLE_ADALIANS_EVENTS}`,
    )
    .action(async (cmd) => {
        const latestBlock = await providerRPC.getBlock("latest");
        console.log(`Latest block is: ${latestBlock.block_number}`);

        let fromBlock: number = latestBlock.block_number;
        if (cmd.fromBlock) {
            fromBlock = parseInt(cmd.fromBlock);
        }

        const adaliansContract = InitializeContract(
            STARKNET_INFLUENCE_ADALIANS_CONTRACT_ADDRESS,
            STARKNET_ADALIANS_ABI_PATH,
        );

        if (!AVAILABLE_ADALIANS_EVENTS.includes(cmd.eventFilter)) {
            throw new Error(`Unsupported event ${cmd.eventFilter}`);
        }
        const nameHash = num.toHex(hash.starknetKeccak(cmd.eventFilter));

        let events: any = [];

        let continuationToken: string | undefined;
        let chunkNum: number = 1;
        let checkBlockNum: number = fromBlock;
        while (true) {
            const eventsList = await providerRPC.getEvents({
                address: STARKNET_INFLUENCE_ADALIANS_CONTRACT_ADDRESS,
                from_block: { block_number: fromBlock },
                to_block: { block_number: latestBlock.block_number },
                keys: [[nameHash]],
                chunk_size: 10,
                continuation_token: continuationToken,
            });

            console.log(`Found ${eventsList.events.length} events`);

            eventsList.events.forEach((i) => {
                // Method .parseEvents requires different structure then from .getEvents
                const parsedEvent = adaliansContract.parseEvents({
                    actual_fee: "",
                    events: [i],
                    execution_status: "",
                    finality_status: "",
                    messages_sent: [],
                    transaction_hash: "",
                });

                const record = parsedEvent[0][cmd.eventFilter];

                const parsedData = EventParser(
                    cmd.eventFilter,
                    i["block_number"],
                    i["transaction_hash"],
                    i["block_hash"],
                    record,
                );
                events.push(parsedData);
                checkBlockNum = i["block_number"];
            });
            console.log("Chunk number:", chunkNum);
            chunkNum++;
            console.log("Check block num:", checkBlockNum);

            continuationToken = eventsList.continuation_token;

            if (!continuationToken) {
                break;
            }
            console.log("continuation_token:", continuationToken);
        }

        if (cmd.output) {
            fs.writeFileSync(cmd.output, JSON.stringify(events));
            console.log(`Saved output to file ${cmd.output}`);
        } else {
            console.log(events);
        }

        return;
    });

const analytics = program
    .command("analytics")
    .description("Prepare analytics from data");
analytics
    .command("leaderboard")
    .description("Generate Moonstream leaderboard")
    .option("--input <path>", "Path to input file with data")
    .option("--output <path>", "Path to output file")
    .action(async (cmd) => {
        if (!cmd.input) {
            throw new Error("Input with data file should be specified");
        }
        const dataJson = fs.readFileSync(cmd.input, "utf8");
        const data = JSON.parse(dataJson);

        let leaderboardData: LeaderBoard[] = [];
        data.forEach((i) => {
            let scoreIncreased = false;
            leaderboardData.forEach((l) => {
                if (i["caller"] == l["address"]) {
                    l["score"]++;
                    scoreIncreased = true;
                }
            });
            if (!scoreIncreased) {
                leaderboardData.push({
                    address: i["caller"],
                    score: 1,
                    points_data: {},
                });
            }
        });

        if (cmd.output) {
            fs.writeFileSync(cmd.output, JSON.stringify(leaderboardData));
            console.log(`Saved output to file ${cmd.output}`);
        } else {
            console.log(leaderboardData);
        }
    });

analytics
    .command("occurrences")
    .description("Counting repetitions based on the keyword from data")
    .option("--input <path>", "Path to input file with data")
    .option("--output <path>", "Path to output file")
    .option("--by <param>", "Names of the key for counting occurrences")
    .action(async (cmd) => {
        if (!cmd.input) {
            throw new Error("Input with data file should be specified");
        }
        const dataJson = fs.readFileSync(cmd.input, "utf8");
        const data = JSON.parse(dataJson);

        const by = cmd.by;
        console.log(by);

        let analyticsData: any[] = [];
        data.forEach((i) => {
            let scoreIncreased = false;
            analyticsData.forEach((l) => {
                if (i[by] == l[by]) {
                    l["occurrences"]++;
                    scoreIncreased = true;
                }
            });
            if (!scoreIncreased) {
                analyticsData.push({
                    [by]: i[by],
                    occurrences: 1,
                    points_data: {},
                });
            }
        });

        if (cmd.output) {
            fs.writeFileSync(cmd.output, JSON.stringify(analyticsData));
            console.log(`Saved output to file ${cmd.output}`);
        } else {
            console.log(analyticsData);
        }
    });

const attributes = program
    .command("attributes")
    .description("Parse attributes")
    .option("--input <path>", "Path to input file with data")
    .option("--output <path>", "Path to output file")
    .action(async (cmd) => {
        if (!cmd.input) {
            throw new Error("Input with data file should be specified");
        }
        const dataJson = fs.readFileSync(cmd.input, "utf8");
        const data = JSON.parse(dataJson);

        let parsedData: any = [];
        data.forEach((i) => {
            let parsedCrew = i;
            parsedCrew["class"] = CrewmateAttrMap["class"][i["class"]];
            parsedData.push(parsedCrew);
        });
        if (cmd.output) {
            fs.writeFileSync(cmd.output, JSON.stringify(parsedData));
            console.log(`Saved output to file ${cmd.output}`);
        } else {
            console.log(parsedData);
        }
    });

program.parse(process.argv);
