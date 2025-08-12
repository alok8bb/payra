use anchor_lang::prelude::*;

use crate::MAX_PARTICIPANTS;

#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub proposal_id: u16,
    #[max_len(32)]
    pub title: String,

    pub amount: u64,
    #[max_len(MAX_PARTICIPANTS)]
    pub spendings: Vec<SpendingShare>,

    #[max_len(MAX_PARTICIPANTS)]
    pub yes_votes: Vec<Pubkey>,
    #[max_len(MAX_PARTICIPANTS)]
    pub no_votes: Vec<Pubkey>,
    pub creator: Pubkey,
    pub deadline: i64,
    pub settled: bool,
    pub cancelled: bool,
    pub bump: u8
}

// for <wallet> => 30% participation in the proposed expense
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct SpendingShare {
    pub wallet: Pubkey,
    pub percentage: u8,
}
