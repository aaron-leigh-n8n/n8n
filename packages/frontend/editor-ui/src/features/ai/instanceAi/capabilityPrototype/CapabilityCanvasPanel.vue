<script setup lang="ts">
// Prototype only. Shows the scripted workflow on the real editor canvas.
import { N8nTabsRoot } from '@n8n/design-system';
import { createEventBus } from '@n8n/utils/event-bus';
import type { IRunData } from 'n8n-workflow';
import { useElementSize } from '@vueuse/core';
import { computed, nextTick, onBeforeUnmount, provide, useTemplateRef, watch } from 'vue';

import { WorkflowDocumentStoreKey } from '@/app/constants/injectionKeys';
import { useWorkflowExecutionStateStore } from '@/app/stores/workflowExecutionState.store';
import type { CanvasEventBusEvents } from '@/features/workflows/canvas/canvas.types';
import WorkflowCanvas from '@/features/workflows/canvas/components/WorkflowCanvas.vue';
import type { IExecutionResponse } from '@/features/execution/executions/executions.types';

import InstanceAiCanvasRunOverlay from '../components/InstanceAiCanvasRunOverlay.vue';
import InstanceAiPreviewTabBar from '../components/InstanceAiPreviewTabBar.vue';
import { useDraftWorkflowDocument } from '../composables/useDraftWorkflowDocument';
import { useStaggeredList } from '../composables/useStaggeredList';
import { draftNodeKey, toDraftWorkflowDb, withDraftNodes } from '../instanceAi.workflowDraftCanvas';
import type { WorkflowDraft } from '../instanceAi.workflowDrafts';
import type { PreviewTab } from '../useCanvasPreview';

const props = defineProps<{
	draft: WorkflowDraft;
	building: boolean;
	run: { runData: IRunData; finished: boolean } | null;
}>();

const TAB_ID = 'capability-prototype-workflow';
const tabs = computed<PreviewTab[]>(() => [
	{
		id: TAB_ID,
		type: 'workflow',
		name: props.draft.workflow.name,
		icon: 'workflow',
		building: props.building,
	},
]);

const eventBus = createEventBus<CanvasEventBusEvents>();
const visibleNodes = useStaggeredList(() => props.draft.workflow.nodes, {
	key: draftNodeKey,
	intervalMs: 420,
	maxDurationMs: 2400,
});
const visibleDraft = computed(() => withDraftNodes(props.draft, visibleNodes.value));
const { documentStore } = useDraftWorkflowDocument(() => visibleDraft.value);
provide(WorkflowDocumentStoreKey, documentStore);

// Keeps every node in view for the demo. The canvas measures a node after it
// mounts, and the panel changes width while it opens, so one fit is too early.
const contentRef = useTemplateRef<HTMLElement>('content');
const { width: contentWidth, height: contentHeight } = useElementSize(contentRef);
const FIT_DELAYS_MS = [0, 150, 400, 800];
let fitTimers: Array<ReturnType<typeof setTimeout>> = [];

function fitAllNodes() {
	for (const timer of fitTimers) clearTimeout(timer);
	fitTimers = FIT_DELAYS_MS.map((delay) => setTimeout(() => eventBus.emit('fitView'), delay));
}

watch(
	[() => visibleNodes.value.map((node) => node.name).join('|'), contentWidth, contentHeight],
	() => {
		void nextTick(fitAllNodes);
	},
	{ immediate: true },
);

onBeforeUnmount(() => {
	for (const timer of fitTimers) clearTimeout(timer);
});

watch(
	[() => props.run, documentStore],
	([run, store]) => {
		if (!store) return;
		const executionState = useWorkflowExecutionStateStore(store.documentId);
		if (!run) {
			executionState.setWorkflowExecutionData(null);
			return;
		}
		// The script has no real execution, so the response is built by hand.
		const execution = {
			id: 'capability-prototype-execution',
			finished: run.finished,
			mode: 'manual',
			status: run.finished ? 'success' : 'running',
			startedAt: new Date(),
			createdAt: new Date(),
			workflowData: toDraftWorkflowDb(props.draft, store.documentId.split('@')[0]),
			data: { resultData: { runData: run.runData } },
		} as unknown as IExecutionResponse;
		executionState.setWorkflowExecutionData(execution);
	},
	{ immediate: true },
);
</script>

<template>
	<N8nTabsRoot :model-value="TAB_ID" orientation="horizontal" :class="$style.panel">
		<InstanceAiPreviewTabBar :tabs="tabs" :active-tab-id="TAB_ID" />
		<div ref="content" :class="$style.content">
			<WorkflowCanvas
				id="capability-prototype-canvas"
				:event-bus="eventBus"
				:read-only="true"
				:striped-background="false"
				:class="$style.canvas"
			/>
			<InstanceAiCanvasRunOverlay v-if="building" state="building" />
		</div>
	</N8nTabsRoot>
</template>

<style lang="scss" module>
.panel {
	display: flex;
	flex-direction: column;
	height: 100%;
}

.content {
	flex: 1;
	min-height: 0;
	position: relative;
	background: var(--background--surface);
}

.canvas {
	position: absolute;
	inset: 0;

	:global(.vue-flow__node) {
		animation: capability-node-enter var(--duration--snappy) var(--easing--ease-out-quart) both;
	}
}

@keyframes capability-node-enter {
	from {
		opacity: 0;
		scale: 0.92;
	}

	to {
		opacity: 1;
		scale: 1;
	}
}
</style>
