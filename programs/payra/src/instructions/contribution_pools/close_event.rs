#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

use crate::{error::PayraError, Event, EventArgs, EventCounter};

#[derive(Accounts)]
pub struct CloseEvent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        close = creator,
        seeds = [b"event", creator.key().as_ref(), &event.event_id.to_le_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,

    pub system_program: Program<'info, System>,
}

impl<'info> CloseEvent<'info> {
    pub fn close_event(&mut self) -> Result<()> {
        let clock = Clock::get()?;

        // Ensure the deadline has passed
        require!(
            clock.unix_timestamp >= self.event.deadline,
            PayraError::DeadlineNotReached
        );

        // Ensure the target was not already met
        require!(
            self.event.total_contributed < self.event.target_amount,
            PayraError::TargetMetAlready
        );
        
        // TODO: refund the amounts to users

        Ok(())
    }
}
