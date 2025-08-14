use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::{error::PayraError, Event, Participant, Proposal};

#[derive(Accounts)]
pub struct SettleEvent<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event.event_id.to_le_bytes().as_ref()],
        bump = event.bump
    )]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [b"proposal", event.key().as_ref(), proposal.proposal_id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,
}

pub fn settle_event_handler<'a>(ctx: Context<SettleEvent>) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    let event = &mut ctx.accounts.event;

    // Can't settle twice
    require!(!proposal.settled, PayraError::AlreadySettled);

    // Can only settle if deadline passed OR all have voted
    let clock = Clock::get()?;
    let eligible_voters = event.whitelist.len() + 1;
    let yes_votes = proposal.yes_votes.len();
    let total_votes = yes_votes + proposal.no_votes.len();
    require!(
        clock.unix_timestamp > proposal.deadline || total_votes == eligible_voters,
        PayraError::TooEarlyToSettle
    );

    // yes > no with 50% or more
    let yes_pct = (yes_votes as u64)
        .checked_mul(100)
        .ok_or(PayraError::MathOverflow)?
        / (eligible_voters as u64);
    require!(yes_pct >= 50, PayraError::NotApproved);

    let mut expected_wallets = event.whitelist.clone();
    expected_wallets.push(event.creator);

    require!(
        ctx.remaining_accounts.len() == expected_wallets.len(),
        PayraError::InvalidParticipantAccounts
    );

    for wallet in expected_wallets.iter() {
        let (expected_pda, _) = Pubkey::find_program_address(
            &[
                b"participant",
                event.event_id.to_le_bytes().as_ref(),
                wallet.as_ref(),
            ],
            ctx.program_id,
        );

        let account_info = ctx
            .remaining_accounts
            .iter()
            .find(|acc| acc.key() == expected_pda)
            .ok_or(PayraError::MissingParticipantAccount)?;

        let participant_data: Participant =
            Participant::try_deserialize(&mut &account_info.data.borrow()[..])?;
        require!(
            participant_data.event == event.key(),
            PayraError::InvalidParticipantEvent
        );
    }

    for i in 0..ctx.remaining_accounts.len() {
        let acc_info = &ctx.remaining_accounts[i];

        // Read
        let mut p: Participant = Participant::try_deserialize(&mut &acc_info.data.borrow()[..])?;
        require!(p.event == event.key(), PayraError::InvalidParticipantEvent);

        let contributed_i64 = p.contributed as i64;
        let spent_i64 = p.spent as i64;

        p.net_owed = contributed_i64
            .checked_sub(spent_i64)
            .ok_or(PayraError::MathOverflow)?;

        // Write back (remaining_accounts must be passed as writable)
        p.try_serialize(&mut &mut acc_info.data.borrow_mut()[..])?;
    }

    proposal.settled = true;

    Ok(())
}
