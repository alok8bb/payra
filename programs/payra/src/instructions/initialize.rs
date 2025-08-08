use anchor_lang::prelude::*;

use crate::{EventCounter};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    // event counter for contribution pools
    #[account(
        init,
        seeds = [b"event_counter"],
        space = 8 + EventCounter::INIT_SPACE,
        payer = admin,
        bump
    )]
    pub event_counter: Account<'info, EventCounter>,

    pub system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    pub fn handler(&mut self, bumps: &InitializeBumps) -> Result<()> {
        // initialize event counter
        self.event_counter.set_inner(EventCounter {
            count: 0,
            bump: bumps.event_counter,
        });
        Ok(())
    }
}
