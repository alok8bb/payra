import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Payra } from "../../target/types/payra";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
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
    await provider.connection.requestAirdrop(wallet, 2 * LAMPORTS_PER_SOL);
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
      6, // decimals
    );

    poolCreatorUsdcATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      poolCreator.publicKey, // owner
    );

    poolUserUsdcATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      poolUser.publicKey, // owner
    );

    poolUserBUsdcATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      poolUserB.publicKey, // owner
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      poolCreatorUsdcATA.address, // ATA address
      provider.wallet.payer.publicKey, // mint authority
      1000 * 10 ** 6, // amount in base units
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      poolUserUsdcATA.address, // ATA address
      provider.wallet.payer.publicKey, // mint authority
      1000 * 10 ** 6, // amount in base units
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      poolUserBUsdcATA.address, // ATA address
      provider.wallet.payer.publicKey, // mint authority
      1000 * 10 ** 6, // amount in base units
    );
  });

  // PDAs
  const [eventCounterPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("event_counter")],
    program.programId,
  );

  const [eventPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("event"), new anchor.BN(0).toArrayLike(Buffer, "le", 8)],
    program.programId,
  );

  const [userParticipantPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("participant"),
      new anchor.BN(0).toArrayLike(Buffer, "le", 8),
      poolUser.publicKey.toBuffer(),
    ],
    program.programId,
  );

  const [userBParticipantPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("participant"),
      new anchor.BN(0).toArrayLike(Buffer, "le", 8),
      poolUserB.publicKey.toBuffer(),
    ],
    program.programId,
  );

  it("initialize protocol", async () => {
    try {
      await program.methods
        .initialize()
        .accountsStrict({
          admin: provider.wallet.publicKey,
          eventCounter: eventCounterPDA,
          systemProgram,
        })
        .rpc();

      const counterState =
        await program.account.eventCounter.fetch(eventCounterPDA);
    } catch (e) {
      console.log(e);
    }
  });

  it("create event", async () => {
    const now = Math.floor(Date.now() / 1000);
    const deadline = new anchor.BN(now + 60); // 1 seconds ahead of now for testing purposes

    const eventArgs = {
      name: "Group Trip",
      deadline,
      targetAmount: new anchor.BN(100 * 10 ** 6),
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

  it("whitelist users", async () => {
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
      poolUser.publicKey.toBase58(),
    );
  });

  it("users contribute 200 each", async () => {
    const eventVault = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      eventPDA, // owner
      true,
    );

    await program.methods
      .contribute(new anchor.BN(200 * 10 ** 6))
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
      eventVault.address,
    );
    assert.equal(vaultBalanceAfter.value.uiAmount, 400);
  });

  it("creator creates a proposal", async () => {
    const now = Math.floor(Date.now() / 1000);
    const deadline = new anchor.BN(now + 60); // 1 seconds ahead of now for testing purposes
    const event = await program.account.event.fetch(eventPDA);
    const [proposalPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        eventPDA.toBuffer(),
        new anchor.BN(event.proposalCount).toArrayLike(Buffer, "le", 2),
      ],
      program.programId,
    );
    const proposalArgs = {
      title: "Dinner bills at Hong Kong",
      amount: new anchor.BN(100 * 10 ** 6),
      spendings: [
        { wallet: poolUser.publicKey, percentage: 50 },
        { wallet: poolUserB.publicKey, percentage: 50 },
      ],
      deadline: deadline,
    };

    await program.methods
      .createProposal(
        proposalArgs.title,
        proposalArgs.amount,
        proposalArgs.spendings,
        proposalArgs.deadline,
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
      })),
    );

    const eventAfter = await program.account.event.fetch(eventPDA);
    assert.equal(eventAfter.proposalCount, 1);
  });

  it("votes yes to the proposal", async () => {
    const [proposalPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        eventPDA.toBuffer(),
        new anchor.BN(0).toArrayLike(Buffer, "le", 2),
      ],
      program.programId,
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
    console.log(proposal.yesVotes[0].toBase58(), poolUser.publicKey);
  });
  
  it("fails on voting again", async () => {
    const [proposalPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        eventPDA.toBuffer(),
        new anchor.BN(0).toArrayLike(Buffer, "le", 2),
      ],
      program.programId,
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
    }catch(err) {
      const anchorError = err.error || err;
      assert.equal(anchorError.errorCode.code, "AlreadyVoted");
    }
  })
});
