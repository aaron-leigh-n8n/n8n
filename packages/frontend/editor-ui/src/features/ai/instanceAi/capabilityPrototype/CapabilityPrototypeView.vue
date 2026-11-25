<script setup lang="ts">
// Prototype only. Plays a scripted "give this workflow more tools" flow in the
// real Assistant thread UI. Open it at /assistant-prototype/capabilities.
// It needs no connected model: the script answers, and nothing goes to the backend.
import type { IRunData } from 'n8n-workflow';
import { computed, nextTick, onMounted, onUnmounted, provide, ref, useTemplateRef } from 'vue';

import { useDocumentTitle } from '@/app/composables/useDocumentTitle';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import { useSettingsStore } from '@n8n/stores/settings.store';

import InstanceAiConversation from '../components/InstanceAiConversation.vue';
import InstanceAiViewHeader from '../components/InstanceAiViewHeader.vue';
import { ThinkingWordKey } from '../composables/useThinkingWords';
import { provideThread, useInstanceAiStore } from '../instanceAi.store';
import { setScriptedResponder } from '../instanceAi.threadRuntime';
import type { WorkflowDraft } from '../instanceAi.workflowDrafts';
import CapabilityCanvasPanel from './CapabilityCanvasPanel.vue';
import CapabilityChip from './CapabilityChip.vue';
import { closeOffer, offeredCapabilityIds, openOffer, takeCapability } from './capabilityOffer';
import {
	CAPABILITIES,
	CAPABILITY_NODE_TYPES,
	OPENING_PROMPT,
	createChatModelNodeType,
	createCapabilityResponder,
	type Capability,
} from './capabilityScript';

const THREAD_ID = 'capability-prototype-thread';
const TITLE = 'Contact form to Sheets and Slack';

const store = useInstanceAiStore();

// The composer locks when the instance reports no workflow builder, which is the
// case with no model connected. The script needs no builder, so unlock it here.
const appSettingsStore = useSettingsStore();
const moduleSettings = appSettingsStore.moduleSettings['instance-ai'];
const previousBuilderAvailable = moduleSettings?.workflowBuilderAvailable;
if (moduleSettings) moduleSettings.workflowBuilderAvailable = true;
// A reload of the route starts the script again.
store.disposeRuntime(THREAD_ID);
const thread = provideThread(THREAD_ID);
useDocumentTitle().set(TITLE);

// The real thread view provides these. The script has no artifacts to open.
provide('openWorkflowPreview', () => {});
provide(ThinkingWordKey, ref(undefined));

const draft = ref<WorkflowDraft | null>(null);
const building = ref(false);
const run = ref<{ runData: IRunData; finished: boolean } | null>(null);
// The offer keeps the order of the catalog, so a returned pill goes back to its place.
closeOffer();
const offeredCapabilities = computed(() =>
	CAPABILITIES.filter(({ id }) => offeredCapabilityIds.value.includes(id)),
);

const conversation = useTemplateRef<InstanceType<typeof InstanceAiConversation>>('conversation');

setScriptedResponder(
	THREAD_ID,
	createCapabilityResponder({
		showDraft: (next) => {
			draft.value = next;
		},
		setBuilding: (value) => {
			building.value = value;
		},
		showRunStep: (runData, finished) => {
			run.value = { runData, finished };
		},
		clearRun: () => {
			run.value = null;
		},
		offerCapabilities: () => {
			openOffer(CAPABILITIES.map(({ id }) => id));
		},
	}),
);

onMounted(() => {
	// The Assistant shell loads these for the real thread view. The canvas needs them.
	const nodeTypesStore = useNodeTypesStore();
	// Added again after the load, in case the load replaces the list.
	const addStandInNodeTypes = () =>
		nodeTypesStore.setNodeTypes([
			...CAPABILITY_NODE_TYPES,
			createChatModelNodeType((name) => nodeTypesStore.getNodeType(name)),
		]);
	addStandInNodeTypes();
	void nodeTypesStore.loadNodeTypesIfNotLoaded().then(addStandInNodeTypes);
	void nextTick(() =>
		conversation.value?.setPrefill({ text: OPENING_PROMPT, prefillType: 'suggestion_catalog' }),
	);
});

onUnmounted(() => {
	const nodeTypesStore = useNodeTypesStore();
	nodeTypesStore.removeNodeTypes([
		...CAPABILITY_NODE_TYPES,
		createChatModelNodeType((name) => nodeTypesStore.getNodeType(name)),
	]);
	if (moduleSettings) moduleSettings.workflowBuilderAvailable = previousBuilderAvailable;
	setScriptedResponder(THREAD_ID, null);
	store.disposeRuntime(THREAD_ID);
});

/** A pill moves into the composer as a chip. The user sends it like any attachment. */
function addCapability(capability: Capability) {
	takeCapability(capability.id);
	store.pendingComposerAttachments = [
		...store.pendingComposerAttachments,
		{ type: 'agent', id: capability.id, name: capability.name, projectId: 'prototype' },
	];
	conversation.value?.focus();
}

function onMessageSent() {
	// The offer belongs to the turn before the one the user just sent.
	if (thread.messages.filter((message) => message.role === 'user').length > 1) {
		closeOffer();
	}
}
</script>

<template>
	<div :class="$style.threadArea" data-test-id="capability-prototype">
		<div :class="$style.chatArea">
			<div :class="$style.header">
				<InstanceAiViewHeader :title="thread.hasMessages ? TITLE : undefined" />
			</div>
			<div
				:class="[
					$style.contentArea,
					{ [$style.offering]: offeredCapabilities.length > 0 && !thread.isStreaming },
				]"
			>
				<InstanceAiConversation
					ref="conversation"
					:key="THREAD_ID"
					new-thread
					autofocus
					@message-sent="onMessageSent"
				>
					<template #inline-offers>
						<!-- No leave transition: a pill that fades out in place overlaps the next one. -->
						<div
							v-if="offeredCapabilities.length > 0 && !thread.isStreaming"
							:class="$style.capabilities"
							data-test-id="capability-prototype-pills"
						>
							<CapabilityChip
								v-for="capability in offeredCapabilities"
								:key="capability.id"
								:capability-id="capability.id"
								action="add"
								@add="addCapability(capability)"
							/>
						</div>
					</template>
				</InstanceAiConversation>
			</div>
		</div>
		<Transition name="capability-canvas">
			<div v-if="draft" :class="$style.canvasArea">
				<CapabilityCanvasPanel :draft="draft" :building="building" :run="run" />
			</div>
		</Transition>
	</div>
</template>

<style lang="scss" module>
.threadArea {
	flex: 1;
	display: flex;
	width: 100%;
	height: 100%;
	min-width: 0;
	overflow: hidden;
}

.chatArea {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-width: 0;
	overflow: hidden;
	position: relative;
	background-color: var(--color--background--light-2);
}

.header {
	flex-shrink: 0;
}

.contentArea {
	display: flex;
	flex: 1;
	min-height: 0;
	position: relative;
}

.canvasArea {
	flex-shrink: 0;
	width: 58%;
	min-width: 0;
	border-left: var(--border);
}

// The hidden copy and rating row under the question would leave a gap above the
// pills. While the pills show, the row is removed so they sit right under the text.
.offering :global([data-message-id] [class*='_actions_']) {
	display: none;
}

.capabilities {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--2xs);
	width: 100%;
	// The same inline padding as the assistant's text, so the pills line up with the question.
	padding-inline: var(--spacing--sm);
	margin-top: var(--spacing--2xs);
	margin-bottom: var(--spacing--sm);
}
</style>

<style lang="scss">
.capability-canvas-enter-active {
	transition:
		width var(--duration--snappy) var(--easing--ease-in-out),
		opacity var(--duration--snappy) var(--easing--ease-in-out);
}

.capability-canvas-enter-from {
	width: 0 !important;
	opacity: 0;
}
</style>
