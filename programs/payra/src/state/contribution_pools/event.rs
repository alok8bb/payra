use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Event {
    pub event_id: u64,
    pub creator: Pubkey,
    pub withdraw_token_account: Pubkey,
    pub target_amount: u64,
    pub total_contributed: u64,
    pub total_spent: u64,

    #[max_len(10)]
    pub whitelist: Vec<Pubkey>,

    pub is_cancelled: bool,
    pub is_finalized: bool,
    pub deadline: i64,

    #[max_len(32)]
    pub name: String,

    pub bump: u8,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct EventArgs {
    pub name: String,
    pub deadline: i64,
    pub target_amount: u64,
}
