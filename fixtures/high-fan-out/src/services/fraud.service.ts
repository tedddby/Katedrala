export interface RiskSignals {
  email: string;
  hasPhone: boolean;
  lineCount: number;
  totalQuantity: number;
  paymentMethod: "card" | "paypal";
}

export interface RiskAssessment {
  score: number;
  decision: "accept" | "review" | "reject";
}

const DISPOSABLE_DOMAINS = new Set(["mailinator.com", "trashmail.com", "10minutemail.com"]);

export class FraudService {
  constructor(
    private readonly rejectAbove = 70,
    private readonly reviewAbove = 40,
  ) {}

  assess(signals: RiskSignals): RiskAssessment {
    let score = 0;
    const domain = signals.email.split("@")[1]?.toLowerCase() ?? "";
    if (DISPOSABLE_DOMAINS.has(domain)) score += 40;
    if (!signals.hasPhone) score += 10;
    if (signals.lineCount > 20) score += 15;
    if (signals.totalQuantity > 50) score += 20;
    if (signals.paymentMethod === "card") score += 5;
    const decision = score > this.rejectAbove ? "reject" : score > this.reviewAbove ? "review" : "accept";
    return { score, decision };
  }
}
