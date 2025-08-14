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
    #[msg("proposal counter overflowed")]
    ProposalCounterOverflow,
    
    #[msg("Proposal Expired")]
    ProposalExpired,
    
    #[msg("User not authorised to vote for this proposal")]
    NotAuthorizedToVote,
    #[msg("User has already voted for this proposal")]
    AlreadyVoted,
    
    #[msg("withdraw account doesn't match the event's withdarw account")]
    InvalidWithdrawAccount,
    
    NotApproved,
    MissingParticipantAccount,
    AlreadySettled,
    TooEarlyToSettle,
    InvalidParticipantEvent,
    InvalidParticipantWallet,
    InvalidParticipantAccounts,
    MathOverflow,
    
    #[msg("unauthorised user")]
    Unauthorised,
    
    #[msg("event deadline has not yet reached")]
    DeadlineNotReached,
    
    #[msg("event has been cancelled")]
    EventCancelled,
    
    #[msg("target met already")]
    TargetMetAlready,
    
    #[msg("invalid percentage, total should be 100")]
    InvalidPercentage,
    
    #[msg("spendings should have atleast one participant")]
    NoParticipants,
    
    #[msg("whitelist is full")]
    WhitelistFull,
    #[msg("trying to add duplicate wallet to whitelist")]
    DuplicateWallet,
    #[msg("wallet not found in whitelist")]
    NotWhitelisted
}
