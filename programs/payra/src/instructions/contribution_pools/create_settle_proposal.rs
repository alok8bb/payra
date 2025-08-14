use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{error::PayraError, Event, Proposal, ProposalType, SpendingShare};

#[derive(Accounts)]
pub struct CreateSettleProposal<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event.event_id.to_le_bytes().as_ref()],
        bump = event.bump
    )]
    pub event: Account<'info, Event>,

    pub mint: Account<'info, Mint>,

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

impl<'info> CreateSettleProposal<'info> {
    pub fn create_settle_proposal(
        &mut self,
        deadline: i64,
        bumps: CreateSettleProposalBumps,
    ) -> Result<()> {
        // Check whitelist or allow event creator
        require!(
            self.event.whitelist.contains(&self.creator.key())
                || self.event.creator == self.creator.key(),
            PayraError::NotWhitelisted
        );

        require!(
            deadline > Clock::get()?.unix_timestamp,
            PayraError::InvalidDeadline
        );

        self.proposal.set_inner(Proposal {
            title: String::from("Settlement"),
            amount: 0,
            spendings: Vec::new(),
            proposal_type: ProposalType::EventSettlement,
            yes_votes: Vec::new(),
            no_votes: Vec::new(),
            creator: self.creator.key(),
            proposal_id: self.event.proposal_count,
            deadline,
            settled: false,
            cancelled: false,
            bump: bumps.proposal,
        });

        self.event.proposal_count = self
            .event
            .proposal_count
            .checked_add(1)
            .ok_or(PayraError::ProposalCounterOverflow)?;

        Ok(())
    }
}
