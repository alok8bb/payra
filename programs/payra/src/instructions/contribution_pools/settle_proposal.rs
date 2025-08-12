use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::{error::PayraError, Event, Participant, Proposal};

#[derive(Accounts)]
pub struct SettleProposal<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event.event_id.to_le_bytes().as_ref()],
        bump = event.bump
    )]
    pub event: Account<'info, Event>,
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = event,
    )]
    pub event_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"proposal", event.key().as_ref(), proposal.proposal_id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        constraint = withdraw_account.key() == event.withdraw_token_account @ PayraError::InvalidWithdrawAccount
    )]
    pub withdraw_account: Account<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn settle_proposal_handler<'a>(ctx: Context<SettleProposal>) -> Result<()> {
    let clock = Clock::get()?;
    let proposal = &mut ctx.accounts.proposal;

    // Can't settle twice
    require!(!proposal.settled, PayraError::AlreadySettled);

    // Can only settle if deadline passed OR all have voted
    let total_participants = proposal.spendings.len();
    let total_votes = proposal.yes_votes.len() + proposal.no_votes.len();
    require!(
        clock.unix_timestamp > proposal.deadline || total_votes == total_participants,
        PayraError::TooEarlyToSettle
    );

    // if any NO votes, reject proposal
    if !proposal.no_votes.is_empty() {
        proposal.cancelled = true;
        proposal.settled = true;
        return Ok(());
    }

    let cpi_accounts = Transfer {
        from: ctx.accounts.event_vault.to_account_info(),
        to: ctx.accounts.withdraw_account.to_account_info(),
        authority: ctx.accounts.event.to_account_info(),
    };

    let event_seeds: &[&[u8]] = &[
        b"event",
        &ctx.accounts.event.event_id.to_le_bytes(),
        &[ctx.accounts.event.bump],
    ];
    let signer_seeds = &[&event_seeds[..]];
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        ),
        proposal.amount,
    )?;

    require!(
        ctx.remaining_accounts.len() == proposal.spendings.len(),
        PayraError::InvalidParticipantAccounts
    );

    for i in 0..ctx.remaining_accounts.len() {
        let acc = &ctx.remaining_accounts[i];
        let mut participant_data: Participant = Participant::try_deserialize(
            &mut &acc.data.borrow()[..]
        )?;
    
        require!(
            participant_data.event == ctx.accounts.event.key(),
            PayraError::InvalidParticipantEvent
        );
    
        let spending_entry = proposal
            .spendings
            .iter()
            .find(|s| s.wallet == participant_data.wallet)
            .ok_or(PayraError::InvalidParticipantWallet)?;
    
        let spending_amount = proposal
            .amount
            .checked_mul(spending_entry.percentage as u64)
            .ok_or(PayraError::MathOverflow)?
            .checked_div(100)
            .ok_or(PayraError::MathOverflow)?;
    
        participant_data.spent = participant_data
            .spent
            .checked_add(spending_amount)
            .ok_or(PayraError::MathOverflow)?;
    
        participant_data.try_serialize(&mut &mut acc.data.borrow_mut()[..])?;
    }
    
    proposal.settled = true;

    Ok(())
}
