import { useUsersStore } from '@n8n/stores/users.store';
import { AI_GATEWAY_TOP_UP_MODAL_KEY } from '@/app/constants';
import type {
	AiGatewayTopUpVariant,
	AiGatewayUpgradeReason,
} from '@/app/composables/useAiGatewayTopUp';
import { useUIStore } from '@/app/stores/ui.store';
import type { GatewayRejectionType } from '@/features/ai/gateway/gatewayRejection';

type PlanLimitReason = Exclude<AiGatewayUpgradeReason, 'topUp'>;

const REASON_BY_REJECTION: Record<GatewayRejectionType, PlanLimitReason> = {
	premium_model_locked: 'premiumModels',
	request_cost_limit_exceeded: 'requestLimit',
	credits_not_released: 'creditRelease',
};

/**
 * Opens the upgrade prompt for a Gateway credits limit of the account's plan.
 * Only the instance owner can upgrade, so every other user gets the "contact your admin" prompt.
 */
export function usePremiumModelsUpgrade() {
	const uiStore = useUIStore();
	const usersStore = useUsersStore();

	function openPlanLimitUpgrade(reason: PlanLimitReason): void {
		const variant: AiGatewayTopUpVariant = usersStore.isInstanceOwner
			? 'ownerTrial'
			: 'memberTrial';
		uiStore.openModalWithData({
			name: AI_GATEWAY_TOP_UP_MODAL_KEY,
			data: { variant, reason },
		});
	}

	const openPremiumModelsUpgrade = () => openPlanLimitUpgrade('premiumModels');

	const openUpgradeForRejection = (type: GatewayRejectionType) =>
		openPlanLimitUpgrade(REASON_BY_REJECTION[type]);

	return { openPremiumModelsUpgrade, openUpgradeForRejection };
}
