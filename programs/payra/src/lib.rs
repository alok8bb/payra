#![allow(unexpected_cfgs)]
#![allow(deprecated)]
#![allow(ambiguous_glob_reexports)]
#![allow(unused_imports)]
pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("DCqLDvTufZiwAfK3RPeThTTdXDJBsrLxMuxyvDCqaZAR");

#[program]
pub mod payra {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.handler(&ctx.bumps)
    }

    pub fn create_event(ctx: Context<CreateEvent>, args: EventArgs) -> Result<u64> {
        ctx.accounts.create_event(args, &ctx.bumps)
    }
    
    pub fn close_event(ctx: Context<CloseEvent>) -> Result<()> {
        ctx.accounts.close_event()
    }
}
