use anchor_lang::prelude::*;

use crate::EventCounter;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

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
        let event_counter = &mut self.event_counter;
        event_counter.count = 0;
        event_counter.bump = bumps.event_counter;
        Ok(())
    }
}
