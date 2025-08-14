use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token},
};

use crate::{error::PayraError, program::Payra, Event, Proposal, ProposalType};

#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event.event_id.to_le_bytes().as_ref()],
        bump = event.bump
    )]
    pub event: Account<'info, Event>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"proposal", event.key().as_ref(), proposal.proposal_id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> Vote<'info> {
    pub fn vote(&mut self, vote_choice: bool) -> Result<()> {
        let clock = Clock::get()?;
        let proposal = &mut self.proposal;
        require!(
            clock.unix_timestamp <= proposal.deadline,
            PayraError::ProposalExpired
        );

        if let ProposalType::Spending = proposal.proposal_type {
            let allowed = proposal
                .spendings
                .iter()
                .any(|s| s.wallet == self.voter.key());
            require!(allowed, PayraError::NotAuthorizedToVote);
        }

        let already_voted = proposal
            .yes_votes
            .iter()
            .chain(proposal.no_votes.iter())
            .any(|pk| pk == &self.voter.key());
        require!(!already_voted, PayraError::AlreadyVoted);

        match vote_choice {
            true => proposal.yes_votes.push(self.voter.key()),
            false => proposal.no_votes.push(self.voter.key()),
        }

        Ok(())
    }
}
