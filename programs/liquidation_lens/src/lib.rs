use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};

declare_id!("4JbvDU6ejse5QLhjDUrdLVjgfGGRick1byDtsJFWErxb");

#[program]
pub mod liquidation_lens {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let record = &mut ctx.accounts.liquidation_record;
        record.user = ctx.accounts.user.key();
        record.bump = ctx.bumps.liquidation_record;
        msg!("Liquidation record initialized for user: {}", record.user);
        Ok(())
    }

    pub fn trigger_liquidation(
        ctx: Context<TriggerLiquidation>,
        price_id_hex: String,
        min_price: i64,
    ) -> Result<()> {
        let price_update = &ctx.accounts.price_update;
        let clock = Clock::get()?;

        let feed_id = get_feed_id_from_hex(&price_id_hex)
            .map_err(|_| ErrorCode::InvalidPriceId)?;

        let price = price_update
            .get_price_no_older_than(&clock, 60, &feed_id)
            .map_err(|_| ErrorCode::PriceStale)?;

        require!(price.price >= min_price, ErrorCode::PriceTooLow);

        let record = &mut ctx.accounts.liquidation_record;
        record.user = ctx.accounts.user.key();
        record.price_used = price.price;
        record.exponent = price.exponent;
        record.timestamp = clock.unix_timestamp;
        record.price_id = price_id_hex.clone();
        record.bump = ctx.bumps.liquidation_record;

        emit!(LiquidationExecuted {
            user: ctx.accounts.user.key(),
            price_used: price.price,
            conf: price.conf,
            exponent: price.exponent,
            timestamp: clock.unix_timestamp,
            price_id: price_id_hex,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init,
        payer = user,
        space = 8 + LiquidationRecord::INIT_SPACE,
        seeds = [b"liquidation", user.key().as_ref()],
        bump
    )]
    pub liquidation_record: Account<'info, LiquidationRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TriggerLiquidation<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub price_update: Account<'info, PriceUpdateV2>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + LiquidationRecord::INIT_SPACE,
        seeds = [b"liquidation", user.key().as_ref()],
        bump
    )]
    pub liquidation_record: Account<'info, LiquidationRecord>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct LiquidationRecord {
    pub user: Pubkey,
    pub price_used: i64,
    pub exponent: i32,
    pub timestamp: i64,
    #[max_len(100)]
    pub price_id: String,
    pub bump: u8,
}

#[event]
pub struct LiquidationExecuted {
    pub user: Pubkey,
    pub price_used: i64,
    pub conf: u64,
    pub exponent: i32,
    pub timestamp: i64,
    pub price_id: String,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Price is below minimum threshold")]
    PriceTooLow,
    #[msg("Price feed is stale")]
    PriceStale,
    #[msg("Invalid price feed ID")]
    InvalidPriceId,
}
