# Privacy-Preserving On-Chain Advertising Auctions

Harnessing the power of **Zama's Fully Homomorphic Encryption technology**, our project implements a cutting-edge on-chain advertising auction platform that ensures privacy for all participants. This solution allows advertisers to bid for ad space in a secure and confidential manner by utilizing advanced encryption techniques, enabling truly sealed second price auctions.

## The Pain Point

In today's digital advertising landscape, advertisers often face challenges related to privacy, data leakage, and collusion during the bidding process. Traditional auction systems expose sensitive bid information, leaving participants vulnerable to competitive disadvantages. Moreover, the risk of collusion among bidders can result in unfair advantages and distorted market dynamics, ultimately harming both advertisers and platforms.

## FHE — A Game Changer

Our project leverages **Fully Homomorphic Encryption (FHE)** to combat these issues head-on. By utilizing Zama's open-source libraries, such as **Concrete**, **TFHE-rs**, and the **zama-fhe SDK**, we ensure that advertisers can place bids and define their advertising strategies without fear of exposure. The auction mechanism operates on-chain, using homomorphic execution to ensure that only the final winning bid—specifically the second highest—is revealed, effectively preventing bid collusion and safeguarding sensitive information throughout the auction process.

## Key Features

- **FHE-Encrypted Bids:** All bids and advertising strategies are securely encrypted using FHE, ensuring confidentiality.
- **On-Chain Auction Mechanism:** Implements a Vickrey auction model executed entirely on-chain to maintain transparency and security.
- **Sealed Bid Disclosure:** Only the second highest bid is revealed to protect competitors’ information and pricing strategies.
- **Collusion Prevention:** The system design mitigates risks associated with collusion among bidders, fostering a fair bidding environment.
- **User Dashboard:** An intuitive dashboard for advertisers to view auction statuses and their bid placements seamlessly.

## Technology Stack

The technical foundation of our project includes:

- Zama's **zama-fhe SDK** for confidential computing
- **Solidity** for smart contract development
- **Node.js** for backend operations
- **Hardhat** or **Foundry** for testing and deployment of smart contracts
- **React** for the user interface (if applicable)

## Directory Structure

Here is an overview of the project's directory structure:

```
AdAuction_FHE/
├── contracts/
│   └── AdAuction.sol         # Smart contract for the advertising auction
├── scripts/
│   └── deploy.js             # Script to deploy the contracts
├── test/
│   └── AdAuction.test.js      # Test cases for the auction system
├── package.json               # Project dependencies
└── README.md                  # Project documentation
```

## Installation Guide

To set up the project, please follow these steps:

1. Ensure you have **Node.js** installed on your machine.
2. Navigate to the project directory.
3. Run the following command to install the required dependencies:

    ```bash
    npm install
    ```

This will fetch all necessary libraries, including Zama's FHE tools.

## Build & Run Guide

To compile, test, and run the project, execute the following commands:

1. **Compile the smart contracts:**

    ```bash
    npx hardhat compile
    ```

2. **Run the tests to ensure everything works correctly:**

    ```bash
    npx hardhat test
    ```

3. **Deploy the contracts to the Ethereum network (consider using a test network first):**

    ```bash
    npx hardhat run scripts/deploy.js --network <YOUR_NETWORK>
    ```

Replace `<YOUR_NETWORK>` with the desired Ethereum network, such as Rinkeby or Mainnet.

## Acknowledgements

### Powered by Zama

We extend our deepest gratitude to the Zama team for their pioneering work in the field of privacy-preserving technologies, particularly their open-source tools that make it possible to build secure, confidential blockchain applications. Their innovative approach to Fully Homomorphic Encryption is the backbone of our project, enabling us to deliver a truly secure advertising auction system.
