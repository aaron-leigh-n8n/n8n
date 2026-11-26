export interface AiGatewayWalletResponse {
	budget: number;
	balance: number;
	hasEverToppedUp: boolean;
	/** True when the account's plan cannot use the premium models with Gateway credits. */
	premiumModelsLocked?: boolean;
	/** The most one request can cost in USD on the account's plan. Absent when there is no limit. */
	requestCostLimit?: number;
	/**
	 * Credits in USD that the plan releases later, in steps. `balance` does not include them.
	 * Absent or 0 when the account has all its credits.
	 */
	pendingBalance?: number;
	/** The credits in USD that the next release adds. */
	releaseAmount?: number;
	/** ISO 8601 time of the next release. */
	nextReleaseAt?: string;
}
