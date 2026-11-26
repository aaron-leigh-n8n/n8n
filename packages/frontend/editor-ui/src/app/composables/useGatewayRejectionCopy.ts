import { useI18n } from '@n8n/i18n';
import { useAiGatewayStore } from '@/app/stores/aiGateway.store';
import type { GatewayRejection } from '@/features/ai/gateway/gatewayRejection';

/**
 * The title and the message for a run that Gateway credits refused for a plan limit.
 * The node panel and the toast show the same text.
 */
export function useGatewayRejectionCopy() {
	const i18n = useI18n();
	const aiGatewayStore = useAiGatewayStore();

	function describeRejection(rejection: GatewayRejection): { title: string; message: string } {
		if (rejection.type === 'premium_model_locked') {
			return {
				title: i18n.baseText('aiGateway.premiumModels.error.title'),
				message: i18n.baseText('aiGateway.premiumModels.error.message'),
			};
		}

		if (rejection.type === 'credits_not_released') {
			return {
				title: i18n.baseText('aiGateway.drip.error.title'),
				message: i18n.baseText('aiGateway.drip.error.message'),
			};
		}

		// The limit comes from the wallet. The gateway's estimate is not shown.
		const limit = aiGatewayStore.requestCostLimitLabel;
		return {
			title: i18n.baseText('aiGateway.requestLimit.error.title'),
			message: limit
				? i18n.baseText('aiGateway.requestLimit.error.message', { interpolate: { limit } })
				: i18n.baseText('aiGateway.requestLimit.error.message.noLimit'),
		};
	}

	return { describeRejection };
}
