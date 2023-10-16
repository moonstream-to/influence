import { Contract, num, hash, RpcProvider } from "starknet";
import { Command } from "commander";
import fs from "fs";

import {
    WEB3_INFURA_URL,
    STARKNET_ADALIANS_CONTRACT_ADDRESS,
    STARKNET_ADALIANS_ABI_PATH,
} from "./settings";
import {
    CrewmatePurchased,
    CrewmateRecruitedV1,
    CrewmateAttrMap,
} from "./data";

const providerRPC = new RpcProvider({ nodeUrl: WEB3_INFURA_URL });

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

const EventParser = (
    eventType: string,
    blockNumber: number,
    txHash: string,
    record: object,
): CrewmatePurchased | CrewmateRecruitedV1 => {
    let parsedData: CrewmatePurchased | CrewmateRecruitedV1;
    if (eventType == "CrewmatePurchased") {
        parsedData = {
            block_number: blockNumber,
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

const AVAILABLE_ADALIANS_EVENTS = ["CrewmatePurchased", "CrewmateRecruitedV1"];

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
            STARKNET_ADALIANS_CONTRACT_ADDRESS,
            STARKNET_ADALIANS_ABI_PATH,
        );
        const parsedEvents = adaliansContract.parseEvents(txReceipt);
        const parsedData = EventParser(
            cmd.eventFilter,
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
            STARKNET_ADALIANS_CONTRACT_ADDRESS,
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
                address: STARKNET_ADALIANS_CONTRACT_ADDRESS,
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

type LeaderBoard = {
    address: string;
    score: number;
    points_data: object;
};

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
