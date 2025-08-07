use anchor_lang::prelude::*;

#[error_code]
pub enum PayraError {
    #[msg("given deadline must be in the future")]
    InvalidDeadline,
    #[msg("name too long")]
    NameTooLong,
    #[msg("event counter overflowed")]
    EventCounterOverflow,
    
    #[msg("event deadline has not yet reached")]
    DeadlineNotReached,
    
    #[msg("target met already")]
    TargetMetAlready,
}
