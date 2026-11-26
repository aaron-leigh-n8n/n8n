import { computed } from 'vue';
import { useI18n } from '@n8n/i18n';
import { useAiGateway } from '@/app/composables/useAiGateway';

export interface AiGatewayBalancePill {
	text: string;
	/** `info` means the balance is used, but the plan releases more credits later. */
	type: 'default' | 'danger' | 'info';
}

const formatUsd = (amount: number) => `$${amount.toFixed(2)}`;
// A whole amount has no decimals: "$2", not "$2.00".
const formatTotal = (amount: number) =>
	Number.isInteger(amount) ? `$${amount}` : formatUsd(amount);

/**
 * The Gateway credits balance as every balance pill shows it, and the trial terms for a hover.
 * A trial gets its credits in daily steps, so an empty balance can mean "wait", not "out".
 */
export function useAiGatewayBalancePill() {
	const i18n = useI18n();
	// Read through `useAiGateway`, so a host that replaces it controls this composable too.
	// The trial fields are optional: a plan without a drip or a request limit has none.
	const aiGateway: Partial<ReturnType<typeof useAiGateway>> = useAiGateway();

	const pill = computed((): AiGatewayBalancePill | undefined => {
		const balance = aiGateway.balance?.value;
		if (balance === undefined) return undefined;

		if (balance <= 0) {
			return { text: i18n.baseText('aiGateway.wallet.noCredits'), type: 'danger' };
		}
		return {
			text: i18n.baseText('aiGateway.wallet.balanceRemaining', {
				interpolate: { balance: formatUsd(Number(balance)) },
			}),
			type: 'default',
		};
	});

	/** The trial terms in one line, or undefined when the plan does not release credits daily. */
	const trialHint = computed(() => {
		const releaseAmount = aiGateway.releaseAmount?.value;
		const budget = aiGateway.budget?.value;
		if (releaseAmount === undefined || budget === undefined) return undefined;

		return i18n.baseText('aiGateway.trial.hint', {
			interpolate: { amount: formatUsd(releaseAmount), total: formatTotal(budget) },
		});
	});

	return { pill, trialHint };
}
