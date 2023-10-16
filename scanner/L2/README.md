# scanner-l2

## Smart contracts

Adalians - [0x0422d33a3638dcc4c62e72e1d6942cd31eb643ef596ccac2351e0e21f6cd4bf4](https://starkscan.co/contract/0x0422d33a3638dcc4c62e72e1d6942cd31eb643ef596ccac2351e0e21f6cd4bf4)

## CLI

Scan specified events from specified transaction:

```bash
node dist/index.js events standalone \
    --tx "0x00847c9b2bc9425b8e526d6065494c07295f55cf18d7eaabc1430decb57e65a4" \
    --event-filter CrewmateRecruitedV1
```

Scan specified events for block range:

```bash
node dist/index.js events adalians \
    --event-filter CrewmatePurchased \
    --output data/CrewmatePurchased.json \
    --from-block 218426
```

Parse attributes with available map (like for `class` where `2` -> `engineer`):

```bash
node dist/index.js attributes \
    --input data/CrewmateRecruitedV1.json \
    --output data/parsed-CrewmateRecruitedV1.json
```

Parse scanned events to Moonstream leader board format:

```bash
node dist/index.js analytics leaderboard \
    --input data/CrewmatePurchased.json \
    --output data/CrewmatePurchased-leaderboard.json
```

Calculate occurrences:

```bash
node dist/index.js analytics occurrences \
    --by class \
    --input data/parsed-CrewmateRecruitedV1.json \
    --output data/CrewmateRecruitedV1-occurrences.json
```
