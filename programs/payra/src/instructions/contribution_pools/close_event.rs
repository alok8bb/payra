#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount, TransferChecked};

use crate::{error::PayraError, Event, EventArgs, EventCounter};

#[derive(Accounts)]
pub struct CloseEvent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event.event_id.to_le_bytes().as_ref()],
        bump = event.bump
    )]
    pub event: Account<'info, Event>,

    pub mint: Account<'info, Mint>,

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

        self.event.is_cancelled = true;

        Ok(())
    }
}
