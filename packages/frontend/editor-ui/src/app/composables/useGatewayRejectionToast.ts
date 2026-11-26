import { h, type VNode } from 'vue';
import { N8nLink } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { useGatewayRejectionCopy } from '@/app/composables/useGatewayRejectionCopy';
import { usePremiumModelsUpgrade } from '@/app/composables/usePremiumModelsUpgrade';
import { useAiGatewayStore } from '@/app/stores/aiGateway.store';
import {
	useWorkflowDocumentStore,
	type WorkflowDocumentId,
} from '@/app/stores/workflowDocument.store';
import { getGatewayRejection, type GatewayRejection } from '@/features/ai/gateway/gatewayRejection';

/**
 * Explains a run that failed because Gateway credits refused a request for a plan limit:
 * a premium model, or a request over the cost limit. The message offers the upgrade prompt.
 */
export function useGatewayRejectionToast() {
	const i18n = useI18n();
	const aiGatewayStore = useAiGatewayStore();
	const { openUpgradeForRejection } = usePremiumModelsUpgrade();
	const { describeRejection } = useGatewayRejectionCopy();

	function findRejection(
		error: unknown,
		nodeName: string,
		documentId: WorkflowDocumentId,
	): GatewayRejection | undefined {
		const rejection = getGatewayRejection(error);
		if (rejection) return rejection;

		// Not every node keeps the gateway response, so also check the node's own model.
		const node = useWorkflowDocumentStore(documentId).getNodeByName(nodeName);
		return node && aiGatewayStore.getLockedModel(node)
			? { type: 'premium_model_locked' }
			: undefined;
	}

	/** The toast title and message when a plan limit stopped the named node. */
	function getRejectionToast(
		error: unknown,
		nodeName: string | undefined,
		documentId: WorkflowDocumentId,
	): { title: string; message: VNode } | undefined {
		if (!nodeName) return undefined;
		const rejection = findRejection(error, nodeName, documentId);
		if (!rejection) return undefined;

		const { type } = rejection;
		const { title, message } = describeRejection(rejection);
		return {
			title,
			message: h('span', [
				message,
				' ',
				h(N8nLink, { size: 'small', onClick: () => openUpgradeForRejection(type) }, () =>
					i18n.baseText('generic.upgrade'),
				),
			]),
		};
	}

	return { getRejectionToast };
}
