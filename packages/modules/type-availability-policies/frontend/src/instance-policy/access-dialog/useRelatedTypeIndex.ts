import { useToast } from '@n8n/composables/useToast';
import { capabilities, capabilityRegistry } from '@n8n/frontend-module-sdk';
import { useI18n } from '@n8n/i18n';
import { computed, onMounted, ref } from 'vue';

import { buildCredentialTypeIndex, type RelatedTypes } from '../../related-types/relatedTypes';
import type { RestrictedTypeKind } from '../../type-availability-policies.constants';
import { useInstancePolicy } from '../useInstancePolicy';

export type RelatedTypeItem = { name: string; label: string };

export type RelatedTypeSection = {
	kind: RestrictedTypeKind;
	heading: string;
	items: RelatedTypeItem[];
};

const byLabel = (a: RelatedTypeItem, b: RelatedTypeItem) => a.label.localeCompare(b.label);

/**
 * Loads the node and credential type descriptions and the access of the types for an access
 * dialog, and turns related types into the sections that the dialog shows.
 */
export function useRelatedTypeIndex() {
	const i18n = useI18n();
	const toast = useToast();
	const typeDescriptions = capabilityRegistry.use(capabilities.typeDescriptions);
	const instancePolicy = useInstancePolicy();

	// Until the types load, the index is empty and every type would look unrelated.
	const typesLoaded = ref(false);
	onMounted(async () => {
		// A failed earlier read leaves the dropdowns disabled, so each open tries again.
		void instancePolicy.loadAccess();
		try {
			await typeDescriptions.load();
			typesLoaded.value = true;
		} catch (error) {
			toast.showError(error, i18n.baseText('typeAvailabilityPolicies.nodeDialog.loadError'));
		}
	});

	const index = computed(() => buildCredentialTypeIndex(typeDescriptions.nodeTypes()));
	const nodeTypeOf = (name: string) => index.value.latestNodeTypes.get(name);
	const nodeLabel = (name: string) => nodeTypeOf(name)?.displayName ?? name;
	const credentialLabel = (name: string) =>
		typeDescriptions.credentialTypeDisplayName(name) ?? name;

	/** One section for each kind that has related types, with its items in label order. */
	function toSections(related: RelatedTypes): RelatedTypeSection[] {
		const sections: RelatedTypeSection[] = [
			{
				kind: 'node',
				heading: i18n.baseText('typeAvailabilityPolicies.nodeDialog.related.nodes'),
				items: related.nodeTypes.map((name) => ({ name, label: nodeLabel(name) })).sort(byLabel),
			},
			{
				kind: 'credential',
				heading: i18n.baseText('typeAvailabilityPolicies.nodeDialog.related.credentials'),
				items: related.credentialTypes
					.map((name) => ({ name, label: credentialLabel(name) }))
					.sort(byLabel),
			},
		];
		return sections.filter((section) => section.items.length > 0);
	}

	return { typesLoaded, index, nodeTypeOf, nodeLabel, credentialLabel, toSections };
}
