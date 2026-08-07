/**
 * Credit Guard — WZRD stub
 *
 * WZRD-EDIT: QCut upstream uses a license/credits subsystem that is out of scope
 * for this integration. In WZRD, credit enforcement is handled by WZRD's own
 * billing/credits plumbing (Phase 3: fal namespace integration).
 *
 * For Phase 1+2 we keep this API surface so AI model handlers can compile.
 */

export type CreditRequirementResult = {
	allowed: boolean;
	reason?: string;
	requiredCredits?: number;
};

export async function enforceCreditRequirement(
	_args: unknown
): Promise<CreditRequirementResult> {
	return { allowed: true };
}
