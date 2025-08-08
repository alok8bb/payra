use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Event {
    pub event_id: u64,
    pub creator: Pubkey,
    pub target_amount: u64,
    pub total_contributed: u64,
    pub total_spent: u64,

    // allow maximum 10 participants
    #[max_len(10)]
    pub participants: Vec<Participant>,
    
    #[max_len(10)]
    pub whitelist: Vec<Pubkey>,
    
    pub is_finalized: bool,
    pub deadline: i64,
    
    #[max_len(32)]
    pub name: String,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Participant {
    pub wallet: Pubkey,
    pub contributed: u64,
    pub spent: u64,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct EventArgs {
    pub name: String,
    pub deadline: i64,
    pub target_amount: u64,
}
