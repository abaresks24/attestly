import { type Attestation, type Attester, type AssetForReview, attestation } from "./types.js";

/// A human attester: the decision is made off-app (a person clicks approve/reject) and passed in.
export class ManualAttester implements Attester {
  readonly name = "manual";
  constructor(
    private readonly decision: boolean,
    private readonly note = "Reviewed by a human attester",
  ) {}

  evaluate(_asset: AssetForReview): Attestation {
    return attestation(this.decision, this.note);
  }
}
