use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

// Development placeholder. Run `anchor keys sync` before building/deploying.
declare_id!("Fg6PaFpoGXkYsidMpWxTWqkZ7FEfcYkgMQhgDfNQ6HjZ");
pub const FEE_BPS: u64 = 250;
pub const MAX_PRICE: u64 = 1_000_000_000;

#[program]
pub mod agent_market {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, executor: Pubkey, treasury: Pubkey) -> Result<()> {
        require!(executor != Pubkey::default() && treasury != Pubkey::default(), MarketError::InvalidAddress);
        ctx.accounts.config.set_inner(Config { authority: ctx.accounts.authority.key(), executor, treasury, bump: ctx.bumps.config });
        Ok(())
    }

    pub fn register_agent(ctx: Context<RegisterAgent>, uid: [u8;32], kind:u8, price:u64, name:String, description:String) -> Result<()> {
        require!(kind <= 1, MarketError::InvalidAgent);
        require!(!name.trim().is_empty() && name.as_bytes().len() <= 96 && description.as_bytes().len() <= 400, MarketError::InvalidAgent);
        require!(price >= 1_000_000 && price <= MAX_PRICE && (kind != 0 || price >= 6_000_000), MarketError::InvalidAmount);
        ctx.accounts.agent.set_inner(Agent { owner:ctx.accounts.owner.key(),kind,price,completed:0,rating_sum:0,rating_count:0,uid,bump:ctx.bumps.agent,name,description });
        Ok(())
    }

    pub fn open_order(ctx: Context<OpenOrder>, nonce:[u8;32], brief_hash:[u8;32], deadline:i64, parent:Pubkey) -> Result<()> {
        let now=Clock::get()?.unix_timestamp;
        require!(deadline > now && deadline <= now.checked_add(3600).ok_or(MarketError::Overflow)?, MarketError::InvalidDeadline);
        require!(brief_hash != [0;32], MarketError::EmptyResult);
        let amount=ctx.accounts.agent.price;
        let fee=fee_for(amount)?;
        ctx.accounts.order.set_inner(Order {
            buyer:ctx.accounts.buyer.key(),agent:ctx.accounts.agent.key(),seller:ctx.accounts.agent.owner,
            executor:ctx.accounts.config.executor,treasury:ctx.accounts.config.treasury,amount,fee,deadline,nonce,brief_hash,
            result_hash:[0;32],status:0,rating:0,bump:ctx.bumps.order,parent,
        });
        transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(),Transfer{from:ctx.accounts.buyer.to_account_info(),to:ctx.accounts.order.to_account_info()}),amount)?;
        Ok(())
    }

    pub fn settle(ctx: Context<Settle>, result_hash:[u8;32]) -> Result<()> {
        let order=&mut ctx.accounts.order;
        require!(order.status==0,MarketError::OrderClosed);
        require!(Clock::get()?.unix_timestamp < order.deadline,MarketError::Expired);
        require!(result_hash != [0;32],MarketError::EmptyResult);
        let seller_amount=order.amount.checked_sub(order.fee).ok_or(MarketError::Overflow)?;
        order.status=1;
        order.result_hash=result_hash;
        // Only principal leaves escrow; rent remains so the terminal account cannot be replayed.
        order.sub_lamports(order.amount)?;
        ctx.accounts.seller.add_lamports(seller_amount)?;
        ctx.accounts.treasury.add_lamports(order.fee)?;
        ctx.accounts.agent.completed=ctx.accounts.agent.completed.checked_add(1).ok_or(MarketError::Overflow)?;
        Ok(())
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let order=&mut ctx.accounts.order;
        require!(order.status==0,MarketError::OrderClosed);
        require!(Clock::get()?.unix_timestamp >= order.deadline,MarketError::NotExpired);
        order.status=2;
        order.sub_lamports(order.amount)?;
        ctx.accounts.buyer.add_lamports(order.amount)?;
        Ok(())
    }

    pub fn rate(ctx: Context<Rate>, score:u8) -> Result<()> {
        require!(ctx.accounts.order.status==1,MarketError::NotCompleted);
        require!(ctx.accounts.order.rating==0,MarketError::AlreadyRated);
        require!((1..=5).contains(&score),MarketError::InvalidRating);
        ctx.accounts.order.rating=score;
        let agent=&mut ctx.accounts.agent;
        agent.rating_sum=agent.rating_sum.checked_add(score as u64).ok_or(MarketError::Overflow)?;
        agent.rating_count=agent.rating_count.checked_add(1).ok_or(MarketError::Overflow)?;
        Ok(())
    }
}

fn fee_for(amount:u64)->Result<u64>{amount.checked_mul(FEE_BPS).and_then(|n|n.checked_div(10_000)).ok_or_else(||error!(MarketError::Overflow))}

#[derive(Accounts)]
pub struct Initialize<'info>{
    #[account(mut)] pub authority:Signer<'info>,
    #[account(init,payer=authority,space=8+Config::INIT_SPACE,seeds=[b"config"],bump)] pub config:Account<'info,Config>,
    #[account(constraint=program.programdata_address()?==Some(program_data.key()) @ MarketError::Unauthorized)]
    pub program:Program<'info,crate::program::AgentMarket>,
    #[account(constraint=program_data.upgrade_authority_address==Some(authority.key()) @ MarketError::Unauthorized)]
    pub program_data:Account<'info,ProgramData>,
    pub system_program:Program<'info,System>,
}
#[derive(Accounts)]
#[instruction(uid:[u8;32])]
pub struct RegisterAgent<'info>{
    #[account(mut)] pub owner:Signer<'info>,
    #[account(init,payer=owner,space=8+Agent::INIT_SPACE,seeds=[b"agent",owner.key().as_ref(),uid.as_ref()],bump)] pub agent:Account<'info,Agent>,
    pub system_program:Program<'info,System>,
}
#[derive(Accounts)]
#[instruction(nonce:[u8;32])]
pub struct OpenOrder<'info>{
    #[account(mut)] pub buyer:Signer<'info>,
    #[account(seeds=[b"config"],bump=config.bump)] pub config:Account<'info,Config>,
    #[account(seeds=[b"agent",agent.owner.as_ref(),agent.uid.as_ref()],bump=agent.bump)] pub agent:Account<'info,Agent>,
    #[account(init,payer=buyer,space=8+Order::INIT_SPACE,seeds=[b"order",buyer.key().as_ref(),nonce.as_ref()],bump)] pub order:Account<'info,Order>,
    pub system_program:Program<'info,System>,
}
#[derive(Accounts)]
pub struct Settle<'info>{
    pub executor:Signer<'info>,
    #[account(mut,seeds=[b"order",order.buyer.as_ref(),order.nonce.as_ref()],bump=order.bump,has_one=executor,has_one=agent,has_one=seller,has_one=treasury)] pub order:Account<'info,Order>,
    #[account(mut)] pub agent:Account<'info,Agent>,
    /// CHECK: Must equal the seller recorded at funding; receives only its payment.
    #[account(mut)] pub seller:UncheckedAccount<'info>,
    /// CHECK: Must equal the treasury recorded at funding; receives only the fee.
    #[account(mut)] pub treasury:UncheckedAccount<'info>,
}
#[derive(Accounts)]
pub struct Refund<'info>{
    #[account(mut)] pub buyer:Signer<'info>,
    #[account(mut,seeds=[b"order",order.buyer.as_ref(),order.nonce.as_ref()],bump=order.bump,has_one=buyer)] pub order:Account<'info,Order>,
}
#[derive(Accounts)]
pub struct Rate<'info>{
    pub buyer:Signer<'info>,
    #[account(mut,seeds=[b"order",order.buyer.as_ref(),order.nonce.as_ref()],bump=order.bump,has_one=buyer,has_one=agent)] pub order:Account<'info,Order>,
    #[account(mut)] pub agent:Account<'info,Agent>,
}
#[account]
#[derive(InitSpace)]
pub struct Config {pub authority:Pubkey,pub executor:Pubkey,pub treasury:Pubkey,pub bump:u8}
#[account]
#[derive(InitSpace)]
pub struct Agent {
    pub owner:Pubkey,pub kind:u8,pub price:u64,pub completed:u64,pub rating_sum:u64,pub rating_count:u64,pub uid:[u8;32],pub bump:u8,
    #[max_len(96)] pub name:String,
    #[max_len(400)] pub description:String,
}
#[account]
#[derive(InitSpace)]
pub struct Order {
    pub buyer:Pubkey,pub agent:Pubkey,pub seller:Pubkey,pub executor:Pubkey,pub treasury:Pubkey,
    pub amount:u64,pub fee:u64,pub deadline:i64,pub nonce:[u8;32],pub brief_hash:[u8;32],pub result_hash:[u8;32],
    pub status:u8,pub rating:u8,pub bump:u8,pub parent:Pubkey,
}
#[error_code]
pub enum MarketError {
    #[msg("Unauthorized signer")] Unauthorized,
    #[msg("Invalid address")] InvalidAddress,
    #[msg("Invalid agent")] InvalidAgent,
    #[msg("Invalid amount")] InvalidAmount,
    #[msg("Deadline must be within one hour")] InvalidDeadline,
    #[msg("Arithmetic overflow")] Overflow,
    #[msg("Order is already settled or refunded")] OrderClosed,
    #[msg("Order deadline expired")] Expired,
    #[msg("Refund is not available before the deadline")] NotExpired,
    #[msg("Result hash is empty")] EmptyResult,
    #[msg("Order is not completed")] NotCompleted,
    #[msg("Order already rated")] AlreadyRated,
    #[msg("Rating must be 1 to 5")] InvalidRating,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn commission_is_exact(){assert_eq!(fee_for(20_000_000).unwrap(),500_000);assert_eq!(fee_for(5_000_000).unwrap(),125_000);}
    #[test] fn commission_overflow_rejected(){assert!(fee_for(u64::MAX).is_err());}
    #[test] fn client_order_layout_is_fixed(){assert_eq!(8+Order::INIT_SPACE,323);}
}
