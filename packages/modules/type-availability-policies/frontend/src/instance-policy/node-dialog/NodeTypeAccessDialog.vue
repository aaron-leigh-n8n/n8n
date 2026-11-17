<script setup lang="ts">
import type { PolicyAction } from '@n8n/api-types';
import {
	N8nButton,
	N8nDialog,
	N8nDialogBody,
	N8nDialogFooter,
	N8nTabs,
	N8nText,
} from '@n8n/design-system';
import { useToast } from '@n8n/composables/useToast';
import { capabilities, capabilityRegistry, componentRegistry } from '@n8n/frontend-module-sdk';
import { useI18n } from '@n8n/i18n';
import { computed, onMounted, reactive, ref, shallowReactive, watch } from 'vue';

import TypeAccessSelect from './TypeAccessSelect.vue';
import { usePolicyAdminAccess } from '../../composables/usePolicyAdminAccess';
import { ANY_CREDENTIAL_NODE_TYPES } from '../../related-types/relatedTypes.constants';
import { buildCredentialTypeIndex, getRelatedTypes } from '../../related-types/relatedTypes';
import type { RestrictedTypeKind } from '../../type-availability-policies.constants';
import { useInstancePolicy } from '../useInstancePolicy';

const { nodeType } = defineProps<{ nodeType: string }>();

const open = defineModel<boolean>('open', { default: false });

/** Each section shows this many items, then a button for the rest. */
const SECTION_LIMIT = 6;
const RELATED_TAB = 'related';

type Item = { name: string; label: string };

const i18n = useI18n();
const typeDescriptions = capabilityRegistry.use(capabilities.typeDescriptions);
const NodeTypeIcon = computed(() => componentRegistry.get('node-type-icon'));
const CredentialTypeIcon = computed(() => componentRegistry.get('credential-type-icon'));
const { manageableKinds } = usePolicyAdminAccess();
const instancePolicy = useInstancePolicy();
const toast = useToast();

// Until the types load, the index is empty and every node type would look unrelated.
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
const nodeLabel = (name: string) => index.value.latestNodeTypes.get(name)?.displayName ?? name;
const nodeName = computed(() => nodeLabel(nodeType));

const byLabel = (a: Item, b: Item) => a.label.localeCompare(b.label);

const sections = computed(() => {
	const related = getRelatedTypes(nodeType, index.value);
	return [
		{
			kind: 'node' as const,
			heading: i18n.baseText('typeAvailabilityPolicies.nodeDialog.related.nodes'),
			items: related.nodeTypes
				.map((name): Item => ({ name, label: nodeLabel(name) }))
				.sort(byLabel),
		},
		{
			kind: 'credential' as const,
			heading: i18n.baseText('typeAvailabilityPolicies.nodeDialog.related.credentials'),
			items: related.credentialTypes
				.map(
					(name): Item => ({
						name,
						label: typeDescriptions.credentialTypeDisplayName(name) ?? name,
					}),
				)
				.sort(byLabel),
		},
	].filter((section) => section.items.length > 0);
});

const relatedCount = computed(() =>
	sections.value.reduce((count, section) => count + section.items.length, 0),
);

const tabs = computed(() => [
	{
		value: RELATED_TAB,
		label: i18n.baseText('typeAvailabilityPolicies.nodeDialog.relatedTab'),
		tag: typesLoaded.value ? String(relatedCount.value) : undefined,
	},
]);

const expanded = reactive<Record<RestrictedTypeKind, boolean>>({ node: false, credential: false });
watch(
	() => nodeType,
	() => {
		expanded.node = false;
		expanded.credential = false;
	},
);

function visibleItems(kind: RestrictedTypeKind, items: Item[]) {
	return expanded[kind] ? items : items.slice(0, SECTION_LIMIT);
}

// Shows the chosen access while its save runs. The store holds the access that the server read.
// Each change gets its own token, so an earlier save that ends does not clear a later choice.
const pending = shallowReactive(new Map<string, { action: PolicyAction; token: symbol }>());
const keyOf = (kind: RestrictedTypeKind, name: string) => `${kind}:${name}`;

function accessOf(kind: RestrictedTypeKind, name: string): PolicyAction | undefined {
	return (
		pending.get(keyOf(kind, name))?.action ?? instancePolicy.typeAccess[kind]?.byName.get(name)
	);
}

const canManage = (kind: RestrictedTypeKind) => manageableKinds.value.includes(kind);

async function setAccess(kind: RestrictedTypeKind, name: string, action: PolicyAction) {
	const key = keyOf(kind, name);
	const token = Symbol(key);
	pending.set(key, { action, token });
	try {
		await instancePolicy.setAccess(kind, name, action);
	} finally {
		if (pending.get(key)?.token === token) pending.delete(key);
	}
}
</script>

<template>
	<N8nDialog
		v-model:open="open"
		:header="
			i18n.baseText('typeAvailabilityPolicies.nodeDialog.title', {
				interpolate: { name: nodeName },
			})
		"
		size="xlarge"
		data-test-id="node-type-access-dialog"
	>
		<N8nDialogBody :class="$style.body">
			<section :class="$style.section">
				<N8nText tag="p" size="small" color="text-light" bold>
					{{ i18n.baseText('typeAvailabilityPolicies.nodeDialog.node') }}
				</N8nText>
				<div :class="[$style.item, $style.card]" data-test-id="node-type-access-node">
					<component
						:is="NodeTypeIcon"
						v-if="NodeTypeIcon"
						:node-type="index.latestNodeTypes.get(nodeType)"
						:size="24"
					/>
					<N8nText size="medium" color="text-dark" :class="$style.name">{{ nodeName }}</N8nText>
					<TypeAccessSelect
						:model-value="accessOf('node', nodeType)"
						:label="nodeName"
						@update:model-value="(action) => setAccess('node', nodeType, action)"
					/>
				</div>
			</section>

			<N8nTabs :model-value="RELATED_TAB" :options="tabs" />

			<template v-if="typesLoaded">
				<N8nText
					v-if="ANY_CREDENTIAL_NODE_TYPES.has(nodeType) && canManage('credential')"
					tag="p"
					size="small"
					color="text-dark"
					data-test-id="node-type-access-any-credential"
				>
					{{
						i18n.baseText('typeAvailabilityPolicies.nodeDialog.related.anyCredential', {
							interpolate: { name: nodeName },
						})
					}}
				</N8nText>
				<N8nText
					v-else-if="sections.length === 0"
					tag="p"
					size="small"
					color="text-dark"
					data-test-id="node-type-access-empty"
				>
					{{
						i18n.baseText('typeAvailabilityPolicies.nodeDialog.related.empty', {
							interpolate: { name: nodeName },
						})
					}}
				</N8nText>
				<template v-else>
					<N8nText tag="p" size="small" color="text-dark">
						{{
							i18n.baseText('typeAvailabilityPolicies.nodeDialog.related.description', {
								interpolate: { name: nodeName },
							})
						}}
					</N8nText>
					<section
						v-for="section in sections"
						:key="section.kind"
						:class="$style.section"
						:data-test-id="`node-type-access-related-${section.kind}`"
					>
						<N8nText tag="p" size="small" color="text-light" bold>{{ section.heading }}</N8nText>
						<ul :class="[$style.list, $style.card]">
							<li
								v-for="item in visibleItems(section.kind, section.items)"
								:key="item.name"
								:class="$style.item"
								data-test-id="node-type-access-related-item"
							>
								<component
									:is="NodeTypeIcon"
									v-if="section.kind === 'node' && NodeTypeIcon"
									:node-type="index.latestNodeTypes.get(item.name)"
									:size="20"
								/>
								<component
									:is="CredentialTypeIcon"
									v-else-if="section.kind === 'credential' && CredentialTypeIcon"
									:credential-type-name="item.name"
									:size="20"
								/>
								<N8nText size="medium" color="text-dark" :class="$style.name">
									{{ item.label }}
								</N8nText>
								<TypeAccessSelect
									v-if="canManage(section.kind)"
									:model-value="accessOf(section.kind, item.name)"
									:label="item.label"
									@update:model-value="(action) => setAccess(section.kind, item.name, action)"
								/>
							</li>
						</ul>
						<N8nButton
							v-if="!expanded[section.kind] && section.items.length > SECTION_LIMIT"
							variant="ghost"
							size="small"
							:class="$style.more"
							data-test-id="node-type-access-show-more"
							@click="expanded[section.kind] = true"
						>
							{{
								i18n.baseText('typeAvailabilityPolicies.nodeDialog.related.more', {
									interpolate: { count: String(section.items.length - SECTION_LIMIT) },
								})
							}}
						</N8nButton>
					</section>
				</template>
			</template>
		</N8nDialogBody>
		<N8nDialogFooter>
			<N8nButton variant="solid" data-test-id="node-type-access-done" @click="open = false">
				{{ i18n.baseText('generic.done') }}
			</N8nButton>
		</N8nDialogFooter>
	</N8nDialog>
</template>

<style lang="scss" module>
.body {
	gap: var(--spacing--sm);
}

.section {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
}

.card {
	border: var(--border);
	border-radius: var(--radius--lg);
}

.list {
	list-style: none;
	margin: 0;
	padding: 0;
}

.item {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
	padding: var(--spacing--xs) var(--spacing--sm);

	.list > & + & {
		border-top: var(--border);
	}
}

.name {
	flex: 1;
	min-width: 0;
}

.more {
	align-self: flex-start;
}
</style>
