type Cremate = {
    label: string;
    id: string;
};

export type CrewmatePurchased = {
    block_number: number | undefined;
    transaction_hash: string | undefined;

    crewmate: Cremate;
    caller: string;
};

type Stantion = {
    label: string;
    id: string;
};

type CallerCrew = {
    label: string;
    id: string;
};

export type CrewmateRecruitedV1 = {
    block_number: number | undefined;
    transaction_hash: string | undefined;

    crewmate: Cremate;
    collection: string;
    class: string;
    title: string;
    impactful: string[];
    cosmetic: string[];
    gender: string;
    body: string;
    face: string;
    hair: string;
    hair_color: string;
    clothes: string;
    head: string;
    item: string;
    name: string;
    station: Stantion;
    composition: string[];
    caller_crew: CallerCrew;
    caller: string;
};

export const CrewmateAttrMap = {
    class: {
        "1": "pilot",
        "2": "engineer",
        "3": "miner",
        "4": "merchant",
        "5": "scientist",
    },
};
