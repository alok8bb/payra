use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Participant {
    pub event: Pubkey,
    pub event_id: u64,
    pub wallet: Pubkey,
    pub contributed: u64,
    pub spent: u64,
    pub refunded: bool,
    pub bump: u8,
    pub net_owed: i64,
}
