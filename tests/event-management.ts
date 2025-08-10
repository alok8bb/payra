import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Payra } from "../target/types/payra";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert, expect } from "chai";
import {
  Account,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

describe("event management", () => {
  const provider = anchor.AnchorProvider.env();
  // helpers
  async function airdropBalance(wallet: PublicKey) {
    await provider.connection.requestAirdrop(wallet, 2 * LAMPORTS_PER_SOL);
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  anchor.setProvider(provider);
  const program = anchor.workspace.payra as Program<Payra>;

  // Actors
  // 1. Protocol Creator => Default Signer
  // 2. Pool Creator => Community Pool creator
  // 3. Pool User => Contributor
  const poolCreator = anchor.web3.Keypair.generate();
  const poolUser = anchor.web3.Keypair.generate();

  let usdcMint: PublicKey;
  let poolCreatorUsdcATA: Account;
  let poolUserUsdcATA: Account;

  const systemProgram = anchor.web3.SystemProgram.programId;
  const associatedTokenProgram = anchor.utils.token.ASSOCIATED_PROGRAM_ID;
  const tokenProgram = anchor.utils.token.TOKEN_PROGRAM_ID;

  before(async () => {
    await airdropBalance(poolCreator.publicKey);
    await airdropBalance(poolUser.publicKey);

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
  });

  // PDAs
  const [eventCounterPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("event_counter")],
    program.programId,
  );

  const [event1PDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("event"), new anchor.BN(0).toArrayLike(Buffer, "le", 8)],
    program.programId,
  );

  const [event2PDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("event"), new anchor.BN(1).toArrayLike(Buffer, "le", 8)],
    program.programId,
  );

  const [userParticipantPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("participant"),
      new anchor.BN(1).toArrayLike(Buffer, "le", 8),
      poolUser.publicKey.toBuffer(),
    ],
    program.programId,
  );

  it("initialize protocol", async () => {
    try {
      await program.methods.initialize().rpc();
    } catch (e) {
      console.log(e);
    }
  });

  it("creates two events", async () => {
    const now = Math.floor(Date.now() / 1000);
    const deadline = new anchor.BN(now + 1); // 1 seconds ahead of now for testing purposes
    const deadline2 = new anchor.BN(now + 4);

    const event1Args = {
      name: "Group Trip",
      deadline,
      targetAmount: new anchor.BN(100 * 10 ** 6),
    };
    const event2Args = {
      name: "Event 2",
      deadline: deadline2,
      targetAmount: new anchor.BN(100 * 10 ** 6),
    };
    await program.methods
      .createEvent(event1Args)
      .signers([poolCreator])
      .accounts({
        creator: poolCreator.publicKey,
        mint: usdcMint,
      })
      .rpc();

    await program.methods
      .createEvent(event2Args)
      .signers([poolCreator])
      .accounts({
        creator: poolCreator.publicKey,
        mint: usdcMint,
      })
      .rpc();

    const event1Account = await program.account.event.fetch(event1PDA);
    assert.equal(event1Account.name, event1Args.name);

    const event2Account = await program.account.event.fetch(event2PDA);
    assert.equal(event2Account.name, event2Args.name);
  });

  it("fails to close on deadline not reached", async () => {
    try {
      await program.methods
        .closeEvent()
        .accountsStrict({
          creator: poolCreator.publicKey,
          event: event1PDA,
          systemProgram: anchor.web3.SystemProgram.programId,
          mint: usdcMint,
        })
        .signers([poolCreator])
        .rpc();
    } catch (err) {
      const anchorError = err.error || err;
      assert.equal(anchorError.errorCode.code, "DeadlineNotReached");
    }
  });

  it("closes after deadline reached but target not reached", async () => {
    // wait for deadline to finish
    await sleep(1400);

    // close account
    await program.methods
      .closeEvent()
      .accountsStrict({
        creator: poolCreator.publicKey,
        event: event1PDA,
        systemProgram: anchor.web3.SystemProgram.programId,
        mint: usdcMint,
      })
      .signers([poolCreator])
      .rpc();
  });

  it("whitelist user wallet", async () => {
    await program.methods
      .whitelist([poolUser.publicKey])
      .accountsStrict({
        creator: poolCreator.publicKey,
        event: event2PDA,
      })
      .signers([poolCreator])
      .rpc();

    const event2Account = await program.account.event.fetch(event2PDA);
    assert.equal(
      event2Account.whitelist[0].toBase58(),
      poolUser.publicKey.toBase58(),
    );
  });

  it("contributes 100 usdc to event", async () => {
    const event2Vault = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer, // fee payer
      usdcMint, // mint
      event2PDA, // owner
      true,
    );

    const eventAccountBefore = await program.account.event.fetch(event2PDA);
    const balanceBefore = await provider.connection.getTokenAccountBalance(
      poolUserUsdcATA.address,
    );
    const vaultBalanceBefore = await provider.connection.getTokenAccountBalance(
      event2Vault.address,
    );

    assert.equal(eventAccountBefore.totalContributed.toNumber(), 0);
    assert.equal(balanceBefore.value.uiAmount, 1000);
    assert.equal(vaultBalanceBefore.value.uiAmount, 0);

    await program.methods
      .contribute(new anchor.BN(100 * 10 ** 6))
      .accountsStrict({
        contributor: poolUser.publicKey,
        contributorAta: poolUserUsdcATA.address,
        event: event2PDA,
        eventVault: event2Vault.address,
        mint: usdcMint,
        participant: userParticipantPDA,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
      })
      .signers([poolUser])
      .rpc();

    const eventAccountAfter = await program.account.event.fetch(event2PDA);
    const balanceAfter = await provider.connection.getTokenAccountBalance(
      poolUserUsdcATA.address,
    );
    const vaultBalanceAfter = await provider.connection.getTokenAccountBalance(
      event2Vault.address,
    );
    const participantAccount =
      await program.account.participant.fetch(userParticipantPDA);

    assert.equal(eventAccountAfter.totalContributed.toNumber(), 100 * 10 ** 6);
    assert.equal(balanceAfter.value.uiAmount, 900);
    assert.equal(vaultBalanceAfter.value.uiAmount, 100);
    assert.equal(
      poolUser.publicKey.toBase58(),
      participantAccount.wallet.toBase58(),
    );
    assert.equal(participantAccount.contributed.toNumber(), 100 * 10 ** 6);
  });

  it("fails to close after deadline reached but target achieved", async () => {
    // wait for deadline to finish
    await sleep(3000);

    // close account
    try {
      await program.methods
        .closeEvent()
        .accountsStrict({
          creator: poolCreator.publicKey,
          event: event2PDA,
          systemProgram: anchor.web3.SystemProgram.programId,
          mint: usdcMint,
        })
        .signers([poolCreator])
        .rpc();
    } catch (err) {
      const anchorError = err.error || err;
      assert.equal(anchorError.errorCode.code, "TargetMetAlready");
    }
  });
});
