use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, transfer_checked, Mint, Token, TokenAccount, Transfer, TransferChecked},
};

use crate::{error::PayraError, Event, Participant};

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = contributor,
    )]
    pub contributor_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"event", event.event_id.to_le_bytes().as_ref()],
        bump = event.bump
    )]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = event
    )]
    pub event_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = contributor,
        seeds = [b"participant", event.event_id.to_le_bytes().as_ref(), contributor.key().as_ref()],
        space = 8 + Participant::INIT_SPACE,
        bump
    )]
    pub participant: Account<'info, Participant>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> Contribute<'info> {
    pub fn contribute(&mut self, amount: u64, bumps: &ContributeBumps) -> Result<()> {
        let clock = Clock::get()?;
        // Ensure the deadline has not passed
        require!(
            clock.unix_timestamp < self.event.deadline,
            PayraError::DeadlineAlreadyReached
        );

        // check whitelisted address
        require!(
            self.event.whitelist.contains(&self.contributor.key()),
            PayraError::NotWhitelisted
        );

        // check whether event is not cancelled 
        require!(!self.event.is_cancelled, PayraError::EventCancelled);

        // transfer tokens from contributor -> event vault
        let cpi_accounts = TransferChecked {
            from: self.contributor_ata.to_account_info(),
            to: self.event_vault.to_account_info(),
            authority: self.contributor.to_account_info(),
            mint: self.mint.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), cpi_accounts);
        transfer_checked(cpi_ctx, amount, self.mint.decimals)?;

        // check whether the wallet is set to default pubkey => uninitialized 
        if self.participant.wallet == Pubkey::default() {
            // account freshly created; initialize
            self.participant.set_inner(Participant {
                event: self.event.key(),
                event_id: self.event.event_id,
                wallet: self.contributor.key(),
                contributed: amount,
                spent: 0,
                refunded: false,
                bump: bumps.participant,
            });
        } else {
            // account exists, update contributed amount by adding
            self.participant.contributed = self
                .participant
                .contributed
                .checked_add(amount)
                .ok_or(PayraError::ContributionOverflow)?;
        }
        
        // update total contributed
        self.event.total_contributed = self
            .event
            .total_contributed
            .checked_add(amount)
            .ok_or(PayraError::ContributionOverflow)?;

        Ok(())
    }
}
