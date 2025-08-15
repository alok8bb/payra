import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Payra } from "../../target/types/payra";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { assert } from "chai";
import {
  Account,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

describe("proposal flow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.payra as Program<Payra>;

  // helpers
  async function airdropBalance(wallet: PublicKey) {
    const cluster = provider.connection.rpcEndpoint;
    const isDevnet = cluster.includes('devnet');
    
    if (isDevnet) {
      // Transfer SOL from payer to wallet on devnet
      const transferAmount = LAMPORTS_PER_SOL / 4;
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: provider.wallet.payer.publicKey,
        toPubkey: wallet,
        lamports: transferAmount,
      });
      
      const transaction = new Transaction().add(transferInstruction);
      await provider.sendAndConfirm(transaction);
    } else {
      // Use airdrop for localnet
      await provider.connection.requestAirdrop(wallet, 2 * LAMPORTS_PER_SOL);
    }
  }

  // Actors
  // 1. Protocol Creator => Default Signer
  // 2. Pool Creator => Community Pool creator
  // 3. Pool User => Contributor
  const poolCreator = anchor.web3.Keypair.generate();
  const poolUser = anchor.web3.Keypair.generate();
  const poolUserB = anchor.web3.Keypair.generate();

  let usdcMint: PublicKey;
  let poolCreatorUsdcATA: Account;
  let poolUserUsdcATA: Account;
  let poolUserBUsdcATA: Account;

  const systemProgram = anchor.web3.SystemProgram.programId;
  const associatedTokenProgram = anchor.utils.token.ASSOCIATED_PROGRAM_ID;
  const tokenProgram = anchor.utils.token.TOKEN_PROGRAM_ID;

  before(async () => {
    await airdropBalance(poolCreator.publicKey);
    await airdropBalance(poolUser.publicKey);
    await airdropBalance(poolUserB.publicKey);

    // mint
    usdcMint = await createMint(
      provider.connection,
      provider.wallet.payer, // fee payer
      provider.wallet.payer.publicKey, // mint authority
      null, // freeze authority (none)
      6 // decimals
    );

    poolCreatorUsdcATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      poolCreator.publicKey // owner
    );

    poolUserUsdcATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      poolUser.publicKey // owner
    );

    poolUserBUsdcATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      poolUserB.publicKey // owner
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      poolCreatorUsdcATA.address, // ATA address
      provider.wallet.payer.publicKey, // mint authority
      1000 * 10 ** 6 // amount in base units
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      poolUserUsdcATA.address, // ATA address
      provider.wallet.payer.publicKey, // mint authority
      1000 * 10 ** 6 // amount in base units
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      poolUserBUsdcATA.address, // ATA address
      provider.wallet.payer.publicKey, // mint authority
      1000 * 10 ** 6 // amount in base units
    );
  });

  // PDAs
  const [eventCounterPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("event_counter")],
    program.programId
  );

  const [eventPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("event"), new anchor.BN(2).toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  const [userParticipantPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("participant"),
      new anchor.BN(2).toArrayLike(Buffer, "le", 8),
      poolUser.publicKey.toBuffer(),
    ],
    program.programId
  );

  const [userBParticipantPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("participant"),
      new anchor.BN(2).toArrayLike(Buffer, "le", 8),
      poolUserB.publicKey.toBuffer(),
    ],
    program.programId
  );

  const [poolCreatorParticipantPDA] =
    anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("participant"),
        new anchor.BN(2).toArrayLike(Buffer, "le", 8),
        poolCreator.publicKey.toBuffer(),
      ],
      program.programId
    );

  // it("initialize protocol", async () => {
  //   try {
  //     await program.methods
  //       .initialize()
  //       .accountsStrict({
  //         admin: provider.wallet.publicKey,
  //         eventCounter: eventCounterPDA,
  //         systemProgram,
  //       })
  //       .rpc();

  //     const counterState = await program.account.eventCounter.fetch(
  //       eventCounterPDA
  //     );
  //   } catch (e) {
  //     console.log(e);
  //   }
  // });

  it("create event with specific deadline and target", async () => {
    const now = Math.floor(Date.now() / 1000);
    const deadline = new anchor.BN(now + 60); // 1 seconds ahead of now for testing purposes

    const eventArgs = {
      name: "Group Trip",
      deadline,
      targetAmount: new anchor.BN(300 * 10 ** 6),
    };

    await program.methods
      .createEvent(eventArgs)
      .signers([poolCreator])
      .accounts({
        creator: poolCreator.publicKey,
        mint: usdcMint,
        withdrawTokenAccount: poolCreatorUsdcATA.address,
      })
      .rpc();

    const eventAccount = await program.account.event.fetch(eventPDA);
    assert.equal(eventAccount.name, eventArgs.name);
  });

  it("whitelists multiple users for event", async () => {
    await program.methods
      .whitelist([poolUser.publicKey])
      .accountsStrict({
        creator: poolCreator.publicKey,
        event: eventPDA,
      })
      .signers([poolCreator])
      .rpc();

    await program.methods
      .whitelist([poolUserB.publicKey])
      .accountsStrict({
        creator: poolCreator.publicKey,
        event: eventPDA,
      })
      .signers([poolCreator])
      .rpc();

    const eventAccount = await program.account.event.fetch(eventPDA);
    assert.equal(
      eventAccount.whitelist[0].toBase58(),
      poolUser.publicKey.toBase58()
    );
  });

  it("users contribute specific amounts to event", async () => {
    const eventVault = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      eventPDA, // owner
      true
    );

    await program.methods
      .contribute(new anchor.BN(100 * 10 ** 6))
      .accountsStrict({
        contributor: poolUser.publicKey,
        contributorAta: poolUserUsdcATA.address,
        event: eventPDA,
        eventVault: eventVault.address,
        mint: usdcMint,
        participant: userParticipantPDA,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
      })
      .signers([poolUser])
      .rpc();

    await program.methods
      .contribute(new anchor.BN(200 * 10 ** 6))
      .accountsStrict({
        contributor: poolCreator.publicKey,
        contributorAta: poolCreatorUsdcATA.address,
        event: eventPDA,
        eventVault: eventVault.address,
        mint: usdcMint,
        participant: poolCreatorParticipantPDA,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
      })
      .signers([poolCreator])
      .rpc();

    await program.methods
      .contribute(new anchor.BN(200 * 10 ** 6))
      .accountsStrict({
        contributor: poolUserB.publicKey,
        contributorAta: poolUserBUsdcATA.address,
        event: eventPDA,
        eventVault: eventVault.address,
        mint: usdcMint,
        participant: userBParticipantPDA,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
      })
      .signers([poolUserB])
      .rpc();

    const vaultBalanceAfter = await provider.connection.getTokenAccountBalance(
      eventVault.address
    );
    assert.equal(vaultBalanceAfter.value.uiAmount, 500);
  });

  it("creator creates a proposal with specific details", async () => {
    const now = Math.floor(Date.now() / 1000);
    const deadline = new anchor.BN(now + 60); // 1 seconds ahead of now for testing purposes
    const event = await program.account.event.fetch(eventPDA);
    const [proposalPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        eventPDA.toBuffer(),
        new anchor.BN(event.proposalCount).toArrayLike(Buffer, "le", 2),
      ],
      program.programId
    );
    const proposalArgs = {
      title: "Dinner bills at Hong Kong",
      amount: new anchor.BN(200 * 10 ** 6),
      spendings: [
        { wallet: poolUser.publicKey, percentage: 80 },
        { wallet: poolUserB.publicKey, percentage: 20 },
      ],
      deadline: deadline,
    };

    await program.methods
      .createProposal(
        proposalArgs.title,
        proposalArgs.amount,
        proposalArgs.spendings,
        proposalArgs.deadline
      )
      .accountsStrict({
        creator: poolCreator.publicKey,
        event: eventPDA,
        mint: usdcMint,
        proposal: proposalPDA,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
      })
      .signers([poolCreator])
      .rpc();

    const proposal = await program.account.proposal.fetch(proposalPDA);
    assert.equal(proposal.amount.toNumber(), proposalArgs.amount.toNumber());
    assert.deepStrictEqual(
      proposal.spendings.map((s) => ({
        wallet: s.wallet.toBase58(),
        percentage: s.percentage,
      })),
      proposalArgs.spendings.map((s) => ({
        wallet: s.wallet.toBase58(),
        percentage: s.percentage,
      }))
    );

    const eventAfter = await program.account.event.fetch(eventPDA);
    assert.equal(eventAfter.proposalCount, 1);
  });

  it("votes yes to the proposal by a user", async () => {
    const [proposalPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        eventPDA.toBuffer(),
        new anchor.BN(0).toArrayLike(Buffer, "le", 2),
      ],
      program.programId
    );

    await program.methods
      .vote(true)
      .accountsStrict({
        event: eventPDA,
        proposal: proposalPDA,
        systemProgram,
        tokenProgram,
        associatedTokenProgram,
        mint: usdcMint,
        voter: poolUser.publicKey,
      })
      .signers([poolUser])
      .rpc();

    const proposal = await program.account.proposal.fetch(proposalPDA);
    assert.equal(
      proposal.yesVotes[0].toBase58(),
      poolUser.publicKey.toBase58()
    );
  });

  it("fails on voting again by the same user", async () => {
    const [proposalPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        eventPDA.toBuffer(),
        new anchor.BN(0).toArrayLike(Buffer, "le", 2),
      ],
      program.programId
    );

    try {
      await program.methods
        .vote(true)
        .accountsStrict({
          event: eventPDA,
          proposal: proposalPDA,
          systemProgram,
          tokenProgram,
          associatedTokenProgram,
          mint: usdcMint,
          voter: poolUser.publicKey,
        })
        .signers([poolUser])
        .rpc();
    } catch (err) {
      const anchorError = err.error || err;
      assert.equal(anchorError.errorCode.code, "AlreadyVoted");
    }

    await program.methods
      .vote(true)
      .accountsStrict({
        event: eventPDA,
        proposal: proposalPDA,
        systemProgram,
        tokenProgram,
        associatedTokenProgram,
        mint: usdcMint,
        voter: poolUserB.publicKey,
      })
      .signers([poolUserB])
      .rpc();
  });

  it("settles proposal after voting", async () => {
    const [proposalPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        eventPDA.toBuffer(),
        new anchor.BN(0).toArrayLike(Buffer, "le", 2),
      ],
      program.programId
    );
    const eventVault = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      eventPDA, // owner
      true
    );
    const participantPDAs = [userParticipantPDA, userBParticipantPDA];
    await program.methods
      .settleProposal()
      .accountsStrict({
        associatedTokenProgram,
        event: eventPDA,
        eventVault: eventVault.address,
        mint: usdcMint,
        proposal: proposalPDA,
        signer: poolCreator.publicKey,
        systemProgram,
        tokenProgram,
        withdrawAccount: poolCreatorUsdcATA.address,
      })
      .remainingAccounts(
        participantPDAs.map((pda) => ({
          pubkey: pda,
          isWritable: true,
          isSigner: false,
        }))
      )
      .signers([poolCreator])
      .rpc();

    const vaultBalance = await provider.connection.getTokenAccountBalance(
      eventVault.address
    );
    assert.equal(vaultBalance.value.uiAmount, 300);

    const participant = await program.account.participant.fetch(
      userParticipantPDA
    );
    assert.equal(participant.spent.toNumber(), 160 * 10 ** 6);
    const participantB = await program.account.participant.fetch(
      userBParticipantPDA
    );
    assert.equal(participantB.spent.toNumber(), 40 * 10 ** 6);
  });

  it("creates second proposal with mixed votes and settles", async () => {
    const event = await program.account.event.fetch(eventPDA);

    const [proposalPDA2] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        eventPDA.toBuffer(),
        new anchor.BN(event.proposalCount).toArrayLike(Buffer, "le", 2),
      ],
      program.programId
    );

    // Prepare accounts for settlement
    const eventVault = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      usdcMint,
      eventPDA,
      true
    );

    const now = Math.floor(Date.now() / 1000);
    const deadline = new anchor.BN(now + 60);

    const vaultBalanceBefore = await provider.connection.getTokenAccountBalance(
      eventVault.address
    );

    const proposalArgs = {
      title: "Lunch bills at Delhi",
      amount: new anchor.BN(50 * 10 ** 6),
      spendings: [
        { wallet: poolUser.publicKey, percentage: 60 },
        { wallet: poolUserB.publicKey, percentage: 40 },
      ],
      deadline: deadline,
    };

    // Creator creates new proposal
    await program.methods
      .createProposal(
        proposalArgs.title,
        proposalArgs.amount,
        proposalArgs.spendings,
        proposalArgs.deadline
      )
      .accountsStrict({
        creator: poolCreator.publicKey,
        event: eventPDA,
        mint: usdcMint,
        proposal: proposalPDA2,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
      })
      .signers([poolCreator])
      .rpc();

    const proposal2 = await program.account.proposal.fetch(proposalPDA2);
    assert.equal(proposal2.amount.toNumber(), proposalArgs.amount.toNumber());

    // poolUser votes NO
    await program.methods
      .vote(false)
      .accountsStrict({
        event: eventPDA,
        proposal: proposalPDA2,
        systemProgram,
        tokenProgram,
        associatedTokenProgram,
        mint: usdcMint,
        voter: poolUser.publicKey,
      })
      .signers([poolUser])
      .rpc();

    // poolUserB votes YES
    await program.methods
      .vote(true)
      .accountsStrict({
        event: eventPDA,
        proposal: proposalPDA2,
        systemProgram,
        tokenProgram,
        associatedTokenProgram,
        mint: usdcMint,
        voter: poolUserB.publicKey,
      })
      .signers([poolUserB])
      .rpc();

    const participantPDAs = [userParticipantPDA, userBParticipantPDA];

    await program.methods
      .settleProposal()
      .accountsStrict({
        associatedTokenProgram,
        event: eventPDA,
        eventVault: eventVault.address,
        mint: usdcMint,
        proposal: proposalPDA2,
        signer: poolCreator.publicKey,
        systemProgram,
        tokenProgram,
        withdrawAccount: poolCreatorUsdcATA.address,
      })
      .remainingAccounts(
        participantPDAs.map((pda) => ({
          pubkey: pda,
          isWritable: true,
          isSigner: false,
        }))
      )
      .signers([poolCreator])
      .rpc();

    // Check balances after settlement
    const vaultBalanceAfter = await provider.connection.getTokenAccountBalance(
      eventVault.address
    );

    // Fetch participants to verify spending updates
    const participantA = await program.account.participant.fetch(
      userParticipantPDA
    );
    const participantB = await program.account.participant.fetch(
      userBParticipantPDA
    );

    assert.equal(
      vaultBalanceBefore.value.uiAmount,
      vaultBalanceAfter.value.uiAmount
    );

    const proposal2After = await program.account.proposal.fetch(proposalPDA2);
    assert.equal(proposal2After.cancelled, true);
  });

  it("creates settle event proposal with deadline", async () => {
    const now = Math.floor(Date.now() / 1000);
    const deadline = new anchor.BN(now + 60); // 1 seconds ahead of now for testing purposes
    const event = await program.account.event.fetch(eventPDA);
    const [settleProposalPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        eventPDA.toBuffer(),
        new anchor.BN(2).toArrayLike(Buffer, "le", 2),
      ],
      program.programId
    );

    await program.methods
      .createSettleProposal(deadline)
      .accountsStrict({
        creator: poolCreator.publicKey,
        event: eventPDA,
        mint: usdcMint,
        proposal: settleProposalPDA,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
      })
      .signers([poolCreator])
      .rpc();

    const proposal = await program.account.proposal.fetch(settleProposalPDA);
    assert.equal(proposal.deadline.toNumber(), deadline.toNumber());
  });

  it("passes the settle event proposal with votes", async () => {
    const [settleProposalPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        eventPDA.toBuffer(),
        new anchor.BN(2).toArrayLike(Buffer, "le", 2),
      ],
      program.programId
    );

    await program.methods
      .vote(true)
      .accountsStrict({
        event: eventPDA,
        proposal: settleProposalPDA,
        systemProgram,
        tokenProgram,
        associatedTokenProgram,
        mint: usdcMint,
        voter: poolUser.publicKey,
      })
      .signers([poolUser])
      .rpc();

    await program.methods
      .vote(true)
      .accountsStrict({
        event: eventPDA,
        proposal: settleProposalPDA,
        systemProgram,
        tokenProgram,
        associatedTokenProgram,
        mint: usdcMint,
        voter: poolUserB.publicKey,
      })
      .signers([poolUserB])
      .rpc();

    await program.methods
      .vote(true)
      .accountsStrict({
        event: eventPDA,
        proposal: settleProposalPDA,
        systemProgram,
        tokenProgram,
        associatedTokenProgram,
        mint: usdcMint,
        voter: poolCreator.publicKey,
      })
      .signers([poolCreator])
      .rpc();

    const proposal = await program.account.proposal.fetch(settleProposalPDA);
    assert.equal(
      proposal.yesVotes[0].toBase58(),
      poolUser.publicKey.toBase58()
    );
  });

  it("settles the event proposal after passing", async () => {
    const [settleProposalPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        eventPDA.toBuffer(),
        new anchor.BN(2).toArrayLike(Buffer, "le", 2),
      ],
      program.programId
    );
    const eventVault = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      eventPDA, // owner
      true
    );

    const participantPDAs = [
      userParticipantPDA,
      userBParticipantPDA,
      poolCreatorParticipantPDA,
    ];

    await program.methods
      .settleEvent()
      .accountsStrict({
        event: eventPDA,
        proposal: settleProposalPDA,
        signer: poolCreator.publicKey,
      })
      .remainingAccounts([
        ...participantPDAs.map((pda) => ({
          pubkey: pda,
          isWritable: true,
          isSigner: false,
        })),
      ])
      .signers([poolCreator])
      .rpc();

    const vaultBalance = await provider.connection.getTokenAccountBalance(
      eventVault.address
    );
    // assert.equal(vaultBalance.value.uiAmount, 500);

    const participant = await program.account.participant.fetch(
      userParticipantPDA
    );
    // assert.equal(participant.spent.toNumber(), 50 * 10 ** 6);
    const participantB = await program.account.participant.fetch(
      userBParticipantPDA
    );
    // assert.equal(participantB.spent.toNumber(), 50 * 10 ** 6);

    const poolCreatorParticipant = await program.account.participant.fetch(
      poolCreatorParticipantPDA
    );
    assert.equal(poolCreatorParticipant.spent.toNumber(), 0);
    assert.equal(poolCreatorParticipant.contributed.toNumber(), 200 * 10 ** 6);
    assert.equal(poolCreatorParticipant.netOwed.toNumber(), 200 * 10 ** 6);
    assert.equal(participantB.netOwed.toNumber(), 160 * 10 ** 6);
    assert.equal(participant.netOwed.toNumber(), -60 * 10 ** 6);
    assert.equal(vaultBalance.value.uiAmount, 300);
  });
});

/* 

Event Target: 300 
User A: 
	Contributed: 100
	Spent: 160
User B: 
	Contributed: 200
	Spent: 40
User Creator: 
	Contributed: 200

User Creator: 200 
User B: 160
User A: -60 
Event Vault: 300

*/ 