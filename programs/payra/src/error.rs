use anchor_lang::prelude::*;

#[error_code]
pub enum PayraError {
    #[msg("given deadline must be in the future")]
    InvalidDeadline,
    #[msg("event deadline already reached")]
    DeadlineAlreadyReached,
    #[msg("name too long")]
    NameTooLong,
    
    #[msg("event counter overflowed")]
    EventCounterOverflow,
    #[msg("contribution overflowed")]
    ContributionOverflow,
    
    #[msg("unauthorised user")]
    Unauthorised,
    
    #[msg("event deadline has not yet reached")]
    DeadlineNotReached,
    
    #[msg("target met already")]
    TargetMetAlready,
    
    #[msg("whitelist is full")]
    WhitelistFull,
    #[msg("trying to add duplicate wallet to whitelist")]
    DuplicateWallet,
    #[msg("wallet not found in whitelist")]
    NotWhitelisted
}
