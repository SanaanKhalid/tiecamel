use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

declare_id!("4G9rXL6BLXEKWM9QT6YWSBpXaTFBGmYbLB77P3vpZtxD");
const MAX_MEMBERS: usize = 12;
const ZERO: [u8; 32] = [0; 32];

#[program]
pub mod tiecamel_governance {
    use super::*;

    pub fn initialize_board(
        ctx: Context<InitializeBoard>,
        chain_id: [u8; 32],
        members: Vec<Member>,
        threshold: u8,
        service: Pubkey,
    ) -> Result<()> {
        require!(chain_id != ZERO, GovernanceError::EmptyCommitment);
        validate_roster(&members, threshold, service)?;
        require_quorum(&members, threshold, &signed_keys(ctx.remaining_accounts))?;
        let board = &mut ctx.accounts.board;
        board.chain_id = chain_id;
        board.members = members;
        board.threshold = threshold;
        board.service = service;
        board.policy_version = 1;
        board.sequence = 0;
        board.head = ZERO;
        board.bump = ctx.bumps.board;
        let digest = hashv(&[
            b"tiecamel:board:v1",
            &board.members.try_to_vec()?,
            &[threshold],
            service.as_ref(),
        ])
        .to_bytes();
        append(board, Pubkey::default(), 0, digest)?;
        Ok(())
    }

    pub fn register_case(
        ctx: Context<RegisterCase>,
        case_id: [u8; 32],
        owner_identity: [u8; 32],
        expected_parent: [u8; 32],
        notice_commitment: [u8; 32],
    ) -> Result<()> {
        let board = &mut ctx.accounts.board;
        require_parent(board, expected_parent)?;
        require!(
            case_id != ZERO && notice_commitment != ZERO,
            GovernanceError::EmptyCommitment
        );
        require!(
            ctx.accounts.actor.key() == board.service
                || member_by_key(&board.members, ctx.accounts.actor.key()).is_some(),
            GovernanceError::Unauthorized
        );
        require!(
            board.members.iter().any(|m| m.identity == owner_identity),
            GovernanceError::UnknownOwner
        );
        let case = &mut ctx.accounts.case;
        case.board = board.key();
        case.case_id = case_id;
        case.owner_identity = owner_identity;
        case.submitter_identity = ZERO;
        case.notice_commitment = notice_commitment;
        case.evidence_commitment = ZERO;
        case.revision = 1;
        case.evidence_revision = 0;
        case.policy_version = board.policy_version;
        case.phase = Phase::Open;
        case.approvals = Vec::new();
        case.bump = ctx.bumps.case;
        append_case(board, case, 1)?;
        Ok(())
    }

    pub fn propose_resolution(
        ctx: Context<CaseAction>,
        expected_revision: u64,
        expected_parent: [u8; 32],
        evidence_commitment: [u8; 32],
    ) -> Result<()> {
        let board = &mut ctx.accounts.board;
        let case = &mut ctx.accounts.case;
        check_case(board, case, expected_revision, expected_parent)?;
        require!(
            evidence_commitment != ZERO,
            GovernanceError::EmptyCommitment
        );
        let submitter = member_by_key(&board.members, ctx.accounts.actor.key())
            .ok_or(GovernanceError::Unauthorized)?;
        case.submitter_identity = submitter.identity;
        case.evidence_commitment = evidence_commitment;
        case.revision = increment(case.revision)?;
        case.evidence_revision = case.revision;
        case.policy_version = board.policy_version;
        case.approvals.clear();
        case.phase = Phase::Review;
        append_case(board, case, 2)?;
        Ok(())
    }

    pub fn approve_resolution(
        ctx: Context<CaseAction>,
        expected_revision: u64,
        expected_parent: [u8; 32],
        evidence_commitment: [u8; 32],
        policy_version: u64,
    ) -> Result<()> {
        let board = &mut ctx.accounts.board;
        let case = &mut ctx.accounts.case;
        check_case(board, case, expected_revision, expected_parent)?;
        require!(case.phase == Phase::Review, GovernanceError::NotInReview);
        require!(
            policy_version == board.policy_version && case.policy_version == policy_version,
            GovernanceError::StalePolicy
        );
        require!(
            case.evidence_commitment == evidence_commitment,
            GovernanceError::StaleEvidence
        );
        let reviewer = member_by_key(&board.members, ctx.accounts.actor.key())
            .ok_or(GovernanceError::Unauthorized)?;
        validate_reviewer(case, reviewer)?;
        let evidence_revision = case.evidence_revision;
        case.approvals.push(Approval {
            key: reviewer.key,
            identity: reviewer.identity,
            evidence_revision,
            policy_version,
        });
        case.revision = increment(case.revision)?;
        append_case(board, case, 3)?;
        Ok(())
    }

    pub fn finalize_resolution(
        ctx: Context<CaseAction>,
        expected_revision: u64,
        expected_parent: [u8; 32],
        evidence_commitment: [u8; 32],
    ) -> Result<()> {
        let board = &mut ctx.accounts.board;
        let case = &mut ctx.accounts.case;
        check_case(board, case, expected_revision, expected_parent)?;
        require!(
            ctx.accounts.actor.key() == board.service
                || member_by_key(&board.members, ctx.accounts.actor.key()).is_some(),
            GovernanceError::Unauthorized
        );
        require!(
            case.evidence_commitment == evidence_commitment,
            GovernanceError::StaleEvidence
        );
        validate_closure(board, case)?;
        case.phase = Phase::Resolved;
        case.revision = increment(case.revision)?;
        append_case(board, case, 4)?;
        Ok(())
    }

    /// Roster replacement/key recovery uses the CURRENT roster's quorum, never a service key.
    pub fn amend_board(
        ctx: Context<AmendBoard>,
        expected_policy_version: u64,
        expected_parent: [u8; 32],
        members: Vec<Member>,
        threshold: u8,
        service: Pubkey,
    ) -> Result<()> {
        let board = &mut ctx.accounts.board;
        require_parent(board, expected_parent)?;
        require!(
            board.policy_version == expected_policy_version,
            GovernanceError::StalePolicy
        );
        require_quorum(
            &board.members,
            board.threshold,
            &signed_keys(ctx.remaining_accounts),
        )?;
        validate_roster(&members, threshold, service)?;
        board.members = members;
        board.threshold = threshold;
        board.service = service;
        board.policy_version = increment(board.policy_version)?;
        // All unresolved proposals now require resubmission under the new policy.
        let digest = hashv(&[
            b"tiecamel:policy:v1",
            &board.members.try_to_vec()?,
            &[threshold],
            service.as_ref(),
            &board.policy_version.to_le_bytes(),
        ])
        .to_bytes();
        append(board, Pubkey::default(), 5, digest)?;
        Ok(())
    }

    pub fn append_reporting_checkpoint(
        ctx: Context<AmendBoard>,
        expected_policy_version: u64,
        expected_parent: [u8; 32],
        commitment: [u8; 32],
    ) -> Result<()> {
        let board = &mut ctx.accounts.board;
        require_parent(board, expected_parent)?;
        require!(
            board.policy_version == expected_policy_version,
            GovernanceError::StalePolicy
        );
        require!(commitment != ZERO, GovernanceError::EmptyCommitment);
        require_quorum(
            &board.members,
            board.threshold,
            &signed_keys(ctx.remaining_accounts),
        )?;
        append(board, Pubkey::default(), 6, commitment)?;
        Ok(())
    }

    pub fn reassign_case(
        ctx: Context<CaseAction>,
        expected_revision: u64,
        expected_parent: [u8; 32],
        owner_identity: [u8; 32],
    ) -> Result<()> {
        let board = &mut ctx.accounts.board;
        let case = &mut ctx.accounts.case;
        check_case(board, case, expected_revision, expected_parent)?;
        require_quorum(
            &board.members,
            board.threshold,
            &signed_keys(ctx.remaining_accounts),
        )?;
        require!(
            board.members.iter().any(|m| m.identity == owner_identity),
            GovernanceError::UnknownOwner
        );
        case.owner_identity = owner_identity;
        case.approvals.clear();
        case.policy_version = board.policy_version;
        case.revision = increment(case.revision)?;
        append_case(board, case, 7)?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(chain_id: [u8; 32])]
pub struct InitializeBoard<'info> {
    #[account(init, payer = payer, space = 8 + Board::INIT_SPACE, seeds = [b"board", chain_id.as_ref()], bump)]
    pub board: Account<'info, Board>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
#[instruction(case_id: [u8; 32])]
pub struct RegisterCase<'info> {
    #[account(mut, seeds = [b"board", board.chain_id.as_ref()], bump = board.bump)]
    pub board: Account<'info, Board>,
    #[account(init, payer = payer, space = 8 + CriticalCase::INIT_SPACE, seeds = [b"case", board.key().as_ref(), case_id.as_ref()], bump)]
    pub case: Account<'info, CriticalCase>,
    pub actor: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct CaseAction<'info> {
    #[account(mut, seeds = [b"board", board.chain_id.as_ref()], bump = board.bump)]
    pub board: Account<'info, Board>,
    #[account(mut, has_one = board, seeds = [b"case", board.key().as_ref(), case.case_id.as_ref()], bump = case.bump)]
    pub case: Account<'info, CriticalCase>,
    pub actor: Signer<'info>,
}
#[derive(Accounts)]
pub struct AmendBoard<'info> {
    #[account(mut, seeds = [b"board", board.chain_id.as_ref()], bump = board.bump)]
    pub board: Account<'info, Board>,
    pub proposer: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Board {
    pub chain_id: [u8; 32],
    #[max_len(12)]
    pub members: Vec<Member>,
    pub threshold: u8,
    pub service: Pubkey,
    pub policy_version: u64,
    pub sequence: u64,
    pub head: [u8; 32],
    pub bump: u8,
}
#[account]
#[derive(InitSpace)]
pub struct CriticalCase {
    pub board: Pubkey,
    pub case_id: [u8; 32],
    pub owner_identity: [u8; 32],
    pub submitter_identity: [u8; 32],
    pub notice_commitment: [u8; 32],
    pub evidence_commitment: [u8; 32],
    pub revision: u64,
    pub evidence_revision: u64,
    pub policy_version: u64,
    pub phase: Phase,
    #[max_len(12)]
    pub approvals: Vec<Approval>,
    pub bump: u8,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Member {
    pub key: Pubkey,
    pub identity: [u8; 32],
    pub director: bool,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Approval {
    pub key: Pubkey,
    pub identity: [u8; 32],
    pub evidence_revision: u64,
    pub policy_version: u64,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Phase {
    Open,
    Review,
    Resolved,
}
#[event]
pub struct GovernanceCheckpoint {
    pub board: Pubkey,
    pub case: Pubkey,
    pub kind: u8,
    pub sequence: u64,
    pub parent: [u8; 32],
    pub head: [u8; 32],
    pub commitment: [u8; 32],
    pub policy_version: u64,
}

fn member_by_key(members: &[Member], key: Pubkey) -> Option<&Member> {
    members.iter().find(|m| m.key == key)
}
fn increment(value: u64) -> Result<u64> {
    value
        .checked_add(1)
        .ok_or_else(|| error!(GovernanceError::Overflow))
}
fn signed_keys(accounts: &[AccountInfo]) -> Vec<Pubkey> {
    accounts
        .iter()
        .filter(|a| a.is_signer)
        .map(|a| a.key())
        .collect()
}
fn validate_roster(members: &[Member], threshold: u8, service: Pubkey) -> Result<()> {
    require!(
        members.len() >= 3 && members.len() <= MAX_MEMBERS,
        GovernanceError::InvalidRoster
    );
    require!(
        threshold >= 2 && usize::from(threshold) <= members.len() - 1,
        GovernanceError::WeakPolicy
    );
    require!(
        members.iter().any(|m| m.director),
        GovernanceError::DirectorRequired
    );
    for (i, member) in members.iter().enumerate() {
        require!(
            member.key != Pubkey::default() && member.key != service && member.identity != ZERO,
            GovernanceError::InvalidRoster
        );
        require!(
            !members[..i]
                .iter()
                .any(|m| m.key == member.key || m.identity == member.identity),
            GovernanceError::DuplicatePerson
        );
    }
    Ok(())
}
fn require_quorum(members: &[Member], threshold: u8, signers: &[Pubkey]) -> Result<()> {
    let approved: Vec<&Member> = members
        .iter()
        .filter(|m| signers.contains(&m.key))
        .collect();
    require!(
        approved.len() >= usize::from(threshold),
        GovernanceError::QuorumRequired
    );
    require!(
        approved.iter().any(|m| m.director),
        GovernanceError::DirectorRequired
    );
    Ok(())
}
fn require_parent(board: &Board, parent: [u8; 32]) -> Result<()> {
    require!(board.head == parent, GovernanceError::StaleParent);
    Ok(())
}
fn check_case(board: &Board, case: &CriticalCase, revision: u64, parent: [u8; 32]) -> Result<()> {
    require_parent(board, parent)?;
    require!(
        case.phase != Phase::Resolved,
        GovernanceError::AlreadyResolved
    );
    require!(case.revision == revision, GovernanceError::StaleRevision);
    Ok(())
}
fn validate_reviewer(case: &CriticalCase, member: &Member) -> Result<()> {
    require!(
        member.identity != case.owner_identity && member.identity != case.submitter_identity,
        GovernanceError::SelfApproval
    );
    require!(
        !case
            .approvals
            .iter()
            .any(|a| a.identity == member.identity || a.key == member.key),
        GovernanceError::DuplicateApproval
    );
    Ok(())
}
fn validate_closure(board: &Board, case: &CriticalCase) -> Result<()> {
    require!(
        case.phase == Phase::Review && case.evidence_commitment != ZERO,
        GovernanceError::NotInReview
    );
    require!(
        case.policy_version == board.policy_version,
        GovernanceError::StalePolicy
    );
    let mut approved = Vec::new();
    for approval in &case.approvals {
        let member =
            member_by_key(&board.members, approval.key).ok_or(GovernanceError::Unauthorized)?;
        require!(
            member.identity == approval.identity
                && member.identity != case.owner_identity
                && member.identity != case.submitter_identity,
            GovernanceError::SelfApproval
        );
        require!(
            approval.evidence_revision == case.evidence_revision
                && approval.policy_version == board.policy_version,
            GovernanceError::StaleEvidence
        );
        require!(
            !approved.contains(&member.key),
            GovernanceError::DuplicateApproval
        );
        approved.push(member.key);
    }
    require_quorum(&board.members, board.threshold, &approved)
}
fn append_case(board: &mut Account<Board>, case: &Account<CriticalCase>, kind: u8) -> Result<()> {
    let commitment = hashv(&[b"tiecamel:critical-case:v1", &case.try_to_vec()?]).to_bytes();
    append(board, case.key(), kind, commitment)
}
fn append(board: &mut Account<Board>, case: Pubkey, kind: u8, commitment: [u8; 32]) -> Result<()> {
    let parent = board.head;
    board.sequence = increment(board.sequence)?;
    board.head = hashv(&[
        b"tiecamel:governance-head:v1",
        &parent,
        &board.sequence.to_le_bytes(),
        &[kind],
        case.as_ref(),
        &commitment,
        &board.policy_version.to_le_bytes(),
    ])
    .to_bytes();
    emit!(GovernanceCheckpoint {
        board: board.key(),
        case,
        kind,
        sequence: board.sequence,
        parent,
        head: board.head,
        commitment,
        policy_version: board.policy_version
    });
    Ok(())
}

#[error_code]
pub enum GovernanceError {
    #[msg("The roster must contain 3–12 valid, non-service identities")]
    InvalidRoster,
    #[msg("Critical controls cannot be reduced below two independent approvals")]
    WeakPolicy,
    #[msg("A director must participate")]
    DirectorRequired,
    #[msg("One person or key cannot occupy two roster positions")]
    DuplicatePerson,
    #[msg("Current roster quorum is required")]
    QuorumRequired,
    #[msg("The signer is not an adopted reviewer or permitted service")]
    Unauthorized,
    #[msg("Owner identity must be on the adopted roster")]
    UnknownOwner,
    #[msg("Owner and evidence submitter cannot approve closure")]
    SelfApproval,
    #[msg("This person has already approved")]
    DuplicateApproval,
    #[msg("The policy changed; resubmit and review evidence again")]
    StalePolicy,
    #[msg("The evidence does not match this approval")]
    StaleEvidence,
    #[msg("The record head changed; refresh before signing")]
    StaleParent,
    #[msg("The case revision changed; refresh before signing")]
    StaleRevision,
    #[msg("Closure evidence must be under review")]
    NotInReview,
    #[msg("Resolved cases cannot be rewritten")]
    AlreadyResolved,
    #[msg("Commitments cannot be empty")]
    EmptyCommitment,
    #[msg("Monotonic counter overflow")]
    Overflow,
}

#[cfg(test)]
mod tests {
    use super::*;
    fn member(i: u8, director: bool) -> Member {
        Member {
            key: Pubkey::new_from_array([i; 32]),
            identity: [i; 32],
            director,
        }
    }
    fn board() -> Board {
        Board {
            chain_id: [9; 32],
            members: vec![
                member(1, false),
                member(2, false),
                member(3, true),
                member(4, false),
            ],
            threshold: 2,
            service: Pubkey::new_from_array([8; 32]),
            policy_version: 1,
            sequence: 0,
            head: ZERO,
            bump: 1,
        }
    }
    fn case() -> CriticalCase {
        CriticalCase {
            board: Pubkey::default(),
            case_id: [7; 32],
            owner_identity: [1; 32],
            submitter_identity: [1; 32],
            notice_commitment: [5; 32],
            evidence_commitment: [6; 32],
            revision: 2,
            evidence_revision: 2,
            policy_version: 1,
            phase: Phase::Review,
            approvals: vec![],
            bump: 1,
        }
    }
    fn approve(i: u8) -> Approval {
        Approval {
            key: member(i, false).key,
            identity: [i; 32],
            evidence_revision: 2,
            policy_version: 1,
        }
    }
    #[test]
    fn rejects_service_on_roster() {
        let b = board();
        assert!(validate_roster(&b.members, 2, b.members[0].key).is_err());
    }
    #[test]
    fn rejects_duplicate_human_commitments() {
        let mut b = board();
        b.members[1].identity = b.members[0].identity;
        assert!(validate_roster(&b.members, 2, b.service).is_err());
    }
    #[test]
    fn cannot_weaken_threshold() {
        let b = board();
        assert!(validate_roster(&b.members, 1, b.service).is_err());
    }
    #[test]
    fn rejects_owner_and_submitter() {
        let mut c = case();
        assert!(validate_reviewer(&c, &member(1, false)).is_err());
        c.submitter_identity = [2; 32];
        assert!(validate_reviewer(&c, &member(2, false)).is_err());
    }
    #[test]
    fn requires_independent_director() {
        let b = board();
        let mut c = case();
        c.approvals = vec![approve(2), approve(4)];
        assert!(validate_closure(&b, &c).is_err());
        c.approvals = vec![approve(2), approve(3)];
        assert!(validate_closure(&b, &c).is_ok());
    }
    #[test]
    fn rejects_duplicate_and_stale_approvals() {
        let b = board();
        let mut c = case();
        c.approvals = vec![approve(3), approve(3)];
        assert!(validate_closure(&b, &c).is_err());
        c.approvals = vec![approve(2), approve(3)];
        c.evidence_revision += 1;
        assert!(validate_closure(&b, &c).is_err());
    }
    #[test]
    fn roster_amendment_invalidates_pending_closure() {
        let mut b = board();
        let mut c = case();
        c.approvals = vec![approve(2), approve(3)];
        b.policy_version += 1;
        assert!(validate_closure(&b, &c).is_err());
    }
    #[test]
    fn stale_parent_and_revision_fail() {
        let b = board();
        let c = case();
        assert!(check_case(&b, &c, 1, ZERO).is_err());
        assert!(check_case(&b, &c, 2, [3; 32]).is_err());
    }
    #[test]
    fn service_cannot_replace_governance_signers() {
        let b = board();
        assert!(require_quorum(&b.members, b.threshold, &[b.service, b.service]).is_err());
    }
    #[test]
    fn resolved_case_cannot_be_reopened() {
        let b = board();
        let mut c = case();
        c.phase = Phase::Resolved;
        assert!(check_case(&b, &c, 2, ZERO).is_err());
    }
}
