import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Payra } from "../target/types/payra";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("event management", () => {
  const provider = anchor.AnchorProvider.env();
  // helpers
  async function airdropBalance(wallet: PublicKey) {
    await provider.connection.requestAirdrop(wallet, 2 * LAMPORTS_PER_SOL);
  }
  
  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  anchor.setProvider(provider);
  const program = anchor.workspace.payra as Program<Payra>;

  // Actors
  // 1. Protocol Creator => Default Signer
  // 2. User => Community Pool user
  const userKp = anchor.web3.Keypair.generate();

  before(async () => {
    await airdropBalance(userKp.publicKey);
  });

  // PDAs
  const [eventCounterPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("event_counter")],
    program.programId,
  );

  const [eventPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("event"),
      userKp.publicKey.toBuffer(),
      new anchor.BN(0).toArrayLike(Buffer, "le", 8),
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

  it("creates event", async () => {
    const now = Math.floor(Date.now() / 1000);
    const deadline = new anchor.BN(now + 1); // 1 seconds ahead of now for testing purposes

    const eventArgs = {
      name: "Group Trip",
      deadline,
      targetAmount: new anchor.BN(100),
    };
    try {
      await program.methods
        .createEvent(eventArgs)
        .signers([userKp])
        .accounts({
          creator: userKp.publicKey,
        })
        .rpc();
    } catch (e) {
      console.log(e);
    }

    const eventAccount = await program.account.event.fetch(eventPDA);
    assert.equal(eventAccount.name, eventArgs.name);
  });

  it("fails to close on deadline not reached", async () => {
    try {
      await program.methods
        .closeEvent()
        .accountsStrict({
          creator: userKp.publicKey,
          event: eventPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([userKp])
        .rpc();
    } catch (err) {
      const anchorError = err.error || err;
      assert.equal(anchorError.errorCode.code, "DeadlineNotReached");
    }
  });

  it("closes after deadline reached but target not reached", async () => {
    // wait for deadline to finish 
    await sleep(1200);
    
    // close account
    await program.methods
      .closeEvent()
      .accountsStrict({
        creator: userKp.publicKey,
        event: eventPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([userKp])
      .rpc();
  });
  
  // TODO: define to check close fail if target reached 
});
