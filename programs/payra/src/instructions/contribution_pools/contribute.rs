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
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> Contribute<'info> {
    pub fn contribute(&mut self, amount: u64) -> Result<()> {
        let clock = Clock::get()?;

        // Ensure the deadline has not passed
        require!(
            clock.unix_timestamp < self.event.deadline,
            PayraError::DeadlineNotReached
        );

        // check whitelisted address
        require!(
            self.event.whitelist.contains(&self.contributor.key()),
            PayraError::NotWhitelisted
        );

        // transfer tokens from contributor -> event vault
        let cpi_accounts = TransferChecked {
            from: self.contributor_ata.to_account_info(),
            to: self.event_vault.to_account_info(),
            authority: self.contributor.to_account_info(),
            mint: self.mint.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), cpi_accounts);
        transfer_checked(cpi_ctx, amount, self.mint.decimals)?;

        // update the data in event
        let contributor = self.contributor.key();
        if let Some(existing) = self
            .event
            .participants
            .iter_mut()
            .find(|p| p.wallet == contributor)
        {
            existing.contributed = existing
                .contributed
                .checked_add(amount)
                .ok_or(PayraError::ContributionOverflow)?;
        } else {
            self.event.participants.push(Participant {
                wallet: contributor,
                contributed: amount,
                spent: 0,
            });
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
