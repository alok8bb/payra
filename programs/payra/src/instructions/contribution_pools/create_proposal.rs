use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{error::PayraError, Event, Proposal, SpendingShare};

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        seeds = [b"event", event.event_id.to_le_bytes().as_ref()],
        bump = event.bump
    )]
    pub event: Account<'info, Event>,

    pub mint: Account<'info, Mint>,

    #[account(
        associated_token::mint = mint,
        associated_token::authority = event
    )]
    pub event_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = creator,
        space = 8 + Proposal::INIT_SPACE,
        seeds = [b"proposal", event.key().as_ref(), event.proposal_count.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateProposal<'info> {
    pub fn create_proposal(
        &mut self,
        title: String,
        amount: u64,
        spendings: Vec<SpendingShare>,
        deadline: i64,
        bumps: CreateProposalBumps,
    ) -> Result<()> {
        // check whitelisted address
        require!(
            self.event.whitelist.contains(&self.creator.key()),
            PayraError::NotWhitelisted
        );

        require!(spendings.len() > 0, PayraError::NoParticipants);
        require!(
            spendings.iter().map(|s| s.percentage as u16).sum::<u16>() == 100,
            PayraError::InvalidPercentage
        );
        require!(
            deadline > Clock::get()?.unix_timestamp,
            PayraError::InvalidDeadline
        );

        self.proposal.set_inner(Proposal {
            title: title,
            amount,
            spendings,
            yes_votes: Vec::new(),
            no_votes: Vec::new(),
            creator: self.creator.key(),
            deadline,
            settled: false,
            cancelled: false,
            bump: bumps.proposal,
        });

        Ok(())
    }
}
