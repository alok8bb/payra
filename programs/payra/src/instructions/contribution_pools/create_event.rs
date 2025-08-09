#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{Mint, Token, TokenAccount}};

use crate::{error::PayraError, Event, EventArgs, EventCounter, Participant};

#[derive(Accounts)]
pub struct CreateEvent<'info> {
    // creator of the contribution pool
    #[account(mut)]
    pub creator: Signer<'info>,

    // for event_id
    #[account(
        mut,
        seeds = [b"event_counter"],
        bump = event_counter.bump
    )]
    pub event_counter: Account<'info, EventCounter>,

    #[account(
        init,
        payer = creator,
        space = 8 + Event::INIT_SPACE,
        seeds = [
            b"event",
            event_counter.count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub event: Account<'info, Event>,

    pub mint: Account<'info, Mint>,
    #[account(
           init,
           payer = creator,
           associated_token::mint = mint, 
           associated_token::authority = event,
    )]
    pub event_vault: Account<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateEvent<'info> {
    pub fn create_event(&mut self, args: EventArgs, bumps: &CreateEventBumps) -> Result<u64> {
        // name length check
        require!(args.name.len() <= 32, PayraError::NameTooLong);

        // deadline validity check
        let now = Clock::get()?.unix_timestamp;
        require!(args.deadline > now, PayraError::InvalidDeadline);

        // fill the data in event account
        self.event.set_inner(Event {
            event_id: self.event_counter.count,
            creator: self.creator.key(),
            target_amount: args.target_amount,
            total_contributed: 0,
            total_spent: 0,
            participants: Vec::new(),
            whitelist: Vec::new(),
            is_cancelled: false,
            is_finalized: false,
            deadline: args.deadline,
            name: args.name,
            bump: bumps.event,
        });

        let event_id = self.event_counter.count;
        // increase the event_id counter
        self.event_counter.count = event_id
            .checked_add(1)
            .ok_or(PayraError::EventCounterOverflow)?;

        msg!("Event created: {}", event_id);
        Ok(event_id)
    }
}
