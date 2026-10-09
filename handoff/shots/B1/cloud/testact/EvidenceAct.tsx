/** TEMPORARY TEST MARKUP (B1's interface check, not shipped). */
import { StillFigure } from "../StillFigure";

export function EvidenceAct() {
  return (
    <div>
      <h2>Test act block</h2>
      <p>The narration of the test act.</p>
      <StillFigure act="evidence" />
    </div>
  );
}

export function EvidenceFrame() {
  return (
    <p data-caption="e-test" data-act="evidence" data-from="0.4" data-to="0.8" data-obstacle="" style={{ position: "absolute", left: "10%", bottom: "20%", margin: 0 }}>
      Test caption in the act's layer
    </p>
  );
}
