# Payra

![Solana](https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white)
![Anchor](https://img.shields.io/badge/Anchor-00D4AA?style=for-the-badge&logo=anchor&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)

Payra is a solana program that enables small groups to split expenses and manage shared funds. It functions as a mini-DAO system designed for friend groups and communities who need transparent and automated fund distribution when managing shared expenses.

> [!NOTE]  
> Payra was built as the capstone project of [Alok](https://x.com/alok8bb) for [Q3 Builders Turbin3 Cohort](https://turbin3.com). More code of the program can be found [here](https://github.com/solana-turbin3/Q3_25_Builder_Alok/)<br/>
> **Program ID**: `pAYrAkZHxebd89ojqt8pu9fBF8HWfiAcdqs8QFzk6dt`  
> **Deployer**: `GL2QboU6NtwzRyUMx7KNXM9sR23VTXAcd1qkKUHbJDfE` (alok8bb.sol)

## Overview

Payra currently implements expense splitting with democratic voting mechanisms. Future development includes fractionalized NFT functionality. The program enables groups to:

- Create contribution events with funding targets and deadlines
- Manage who can participate and track their contributions
- Propose expenses with custom spending distributions
- Vote on proposals as a group
- Automatically settle approved expenses and distribute funds

## Architecture

### Core Components

#### 1. **Event**
This represents a shared activity or expense pool that the group is managing.

- **Creator**: The person who started the event
- **Target Amount**: How much funding the group wants to raise
- **Deadline**: When contributions and activities need to be completed
- **Whitelist**: Up to 10 approved participant wallets
- **Withdraw Account**: Where approved expenses get sent

#### 2. **Participant**
Each person's individual account that tracks their involvement in an event.

- **PDA Derivation**: `["participant", event_id, wallet_pubkey]`
- **Contribution Tracking**: How much this person has put in
- **Spending Tracking**: How much has been spent on their behalf
- **Net Balance**: Final settlement amount (positive means they should get money back, negative means they owe money)

#### 3. **Proposal**
How the group makes spending decisions through voting.

- **Types**: Regular spending proposals and final event settlement proposals
- **Voting Period**: Groups can set deadlines for when votes need to be collected
- **Approval Logic**: Needs at least 50% yes votes from eligible voters
- **Spending Distribution**: Customize what percentage each participant pays

### Program Design Patterns

#### PDA (Program Derived Address) Strategy
```rust
// Event PDA
seeds = [b"event", event_id.to_le_bytes()]

// Participant PDA  
seeds = [b"participant", event_id.to_le_bytes(), wallet_pubkey]

// Proposal PDA
seeds = [b"proposal", event_key, proposal_id.to_le_bytes()]
```

#### Democratic Voting System
- **Who Can Vote**: Event creator plus everyone on the whitelist
- **When to Settle**: Either the deadline has passed OR everyone has voted
- **Approval Threshold**: At least 50% yes votes from eligible voters

## Features

### Implemented Features

#### **Event Management**
- Create events with custom funding targets, deadlines, and payout accounts
- Manage participant lists (up to 10 people can join)
- Events automatically close when the deadline is reached and target isn't met
- Events stay open when the funding target is achieved

#### **Contribution System**
- Accept SPL token contributions into secure event vaults
- Participant accounts are created automatically when someone contributes
- Track individual and total contributions in real time
- Contributions are only accepted before the deadline

#### **Proposal & Voting Flow**
- Create spending proposals with detailed expense breakdowns
- Simple yes/no voting system for all participants
- Proposals get settled automatically after the voting period
- Support for regular spending proposals and final event settlement

#### **Settlement & Distribution**
- Funds are automatically sent to designated accounts when proposals pass
- Expenses are split proportionally based on the proposal percentages
- The system calculates everyone's final balance (what they contributed minus what they spent)
- Built-in protection against math errors and overflows

#### **Security & Validation**
- Account verification to prevent fake accounts
- Only whitelisted participants can vote and contribute
- Strict deadline and timing checks
- Clear error messages when something goes wrong


### 💡 Use Cases

#### **Friend Group Expenses**
Great for managing shared costs among friends:
- Group trips and hotel bookings
- Shared meals and entertainment
- Event planning and activities
- Keeping track of who owes what

#### **Community Projects**
Perfect for small community initiatives:
- Funding local events
- Buying shared resources
- Making group investment decisions
- Fair fund allocation

#### **Example: Using with Payment Services**
For example, the withdraw account can be set to a KAST.com wallet address, so when expenses are approved, the funds go directly to where they can be spent in the real world.


### Key Instructions

1. **initialize**: Set up the global event counter
2. **create_event**: Start a new contribution event
3. **whitelist**: Add people to an event
4. **contribute**: Add funds to an event vault
5. **create_proposal**: Suggest how to spend money with custom splits
6. **vote**: Cast yes/no votes on proposals
7. **settle_proposal**: Execute approved proposals and send funds out
8. **create_settle_proposal**: Propose wrapping up the entire event
9. **settle_event**: Calculate everyone's final balances
10. **close_event**: Close events that didn't reach their targets

### Running Tests
```bash
# Run all tests
yarn test

# Run specific test file
yarn run ts-mocha tests/active/event-management.ts
yarn run ts-mocha tests/proposal/proposal-accept.ts
```

## Future Development

### Planned Features
- **Fractionalized NFTs**: Let groups share ownership of digital assets
- **Advanced Settlement Options**: Partial payouts and milestone-based settlements
- **Integration APIs**: Better connections with external payment services

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/alok8bb/payra
   cd payra-capstone
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Build the program**
   ```bash
   anchor build
   ```

4. **Run tests**
   ```bash
   anchor test
   ```
