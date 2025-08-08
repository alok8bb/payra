use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{error::PayraError, Event, Participant};

#[derive(Accounts)]
pub struct Whitelist<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        seeds = [b"event", event.event_id.to_le_bytes().as_ref()],
        bump = event.bump
    )]
    pub event: Account<'info, Event>,
}

impl<'info> Whitelist<'info> {
    pub fn whitelist(&mut self, wallets_to_add: Vec<Pubkey>) -> Result<()> {
        require!(
            self.event.whitelist.len() + wallets_to_add.len() <= 10,
            PayraError::WhitelistFull
        );

        {
            let mut batch = wallets_to_add.clone();
            batch.sort();
            batch.dedup();
            require!(
                batch.len() == wallets_to_add.len(),
                PayraError::DuplicateWallet
            );
        }

        // add wallets
        for wallet in wallets_to_add {
            require!(
                !self.event.whitelist.contains(&wallet),
                PayraError::DuplicateWallet
            );
            self.event.whitelist.push(wallet);
        }

        Ok(())
    }
}
