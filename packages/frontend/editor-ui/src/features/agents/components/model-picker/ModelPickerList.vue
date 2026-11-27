<script setup lang="ts">
import {
	N8nBadge,
	N8nIcon,
	N8nListbox,
	N8nListboxItem,
	N8nText,
	N8nTooltip,
	N8nVisuallyHidden,
} from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { useIntersectionObserver } from '@vueuse/core';
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';

import { getProviderCredentialTypes, isAgentModelProvider } from '../../model-providers';
import ModelSelectorTriggerIcon from '../model-selector/ModelSelectorTriggerIcon.vue';
import {
	formatContext,
	formatCost,
	meterRatio,
	MODEL_PICKER_FEATURES,
	type ModelPickerFeature,
	type ModelPickerModel,
} from './modelPicker.utils';

export interface ModelPickerRow {
	model: ModelPickerModel;
	/** Name of the preset that suggests this model. Shown as a badge beside the model's name. */
	presetLabel?: string;
}

export interface ModelPickerMaxima {
	context: number;
	input: number;
	output: number;
}

const props = defineProps<{
	rows: ModelPickerRow[];
	/** Accessible name of the list. */
	label: string;
	selectedModelId?: string;
	/** Largest value of each metric in the catalog. The bars scale against it. */
	maxima: ModelPickerMaxima;
	/** Rows to show at first, and to add each time the end of the list scrolls into view. All when unset. */
	pageSize?: number;
	/** The rows cannot be chosen. For a list that shows what a provider offers before it is connected. */
	readonly?: boolean;
	/** Header of the model column, when it is not just "Model". */
	modelLabel?: string;
}>();

const emit = defineEmits<{ select: [modelId: string] }>();

const i18n = useI18n();

const FEATURES = (Object.keys(MODEL_PICKER_FEATURES) as ModelPickerFeature[]).map((id) => ({
	id,
	...MODEL_PICKER_FEATURES[id],
}));

const columns = computed<Array<{ id: keyof ModelPickerMaxima; label: string }>>(() => [
	{ id: 'context', label: i18n.baseText('agents.modelPicker.column.context') },
	{ id: 'input', label: i18n.baseText('agents.modelPicker.column.input') },
	{ id: 'output', label: i18n.baseText('agents.modelPicker.column.output') },
]);

type MetricId = keyof ModelPickerMaxima;

function metricValue(model: ModelPickerModel, id: MetricId): number | undefined {
	return id === 'context' ? model.limits?.context : model.cost?.[id];
}

function metric(model: ModelPickerModel, id: MetricId) {
	const value = metricValue(model, id);
	if (value === undefined) return null;
	return {
		text: id === 'context' ? formatContext(value) : formatCost(value),
		width: `${meterRatio(value, props.maxima[id]) * 100}%`,
	};
}

/** Both lists sort. Like the Design System data table: high to low, low to high, then off. */
const sort = ref<{ id: MetricId; desc: boolean } | null>(null);

function toggleSort(id: MetricId) {
	if (sort.value?.id !== id) sort.value = { id, desc: true };
	else if (sort.value.desc) sort.value = { id, desc: false };
	else sort.value = null;
}

/** Spoken after the column name, since the arrow is hidden from screen readers. */
function sortState(id: MetricId): string {
	if (sort.value?.id !== id) return '';
	return i18n.baseText(
		sort.value.desc ? 'agents.modelPicker.sort.descending' : 'agents.modelPicker.sort.ascending',
	);
}

/** The rows in sort order. Models without a value for the column go last in both directions. */
const sortedRows = computed(() => {
	const current = sort.value;
	if (!current) return props.rows;
	const direction = current.desc ? -1 : 1;
	return [...props.rows].sort((a, b) => {
		const left = metricValue(a.model, current.id);
		const right = metricValue(b.model, current.id);
		if (left === undefined || right === undefined) {
			return Number(left === undefined) - Number(right === undefined);
		}
		return (left - right) * direction;
	});
});

/** How many rows are drawn. A long catalog draws a page at a time, like the earlier prototype. */
const limit = ref(props.pageSize ?? Infinity);
const list = useTemplateRef<HTMLElement>('list');

/**
 * New rows, or a new order, start again at the first row: one page of rows, at the top
 * of whatever scrolls the list. The scroll waits for the page to finish updating. A list
 * that was hidden while its rows changed, as when a provider is connected, cannot scroll
 * until it shows, and `v-show` only shows it at the end of the update.
 */
watch([() => props.rows, sort], async () => {
	limit.value = props.pageSize ?? Infinity;
	await nextTick();
	for (let parent = list.value?.parentElement; parent; parent = parent.parentElement) {
		if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
			parent.scrollTop = 0;
			return;
		}
	}
});

const hasMore = computed(() => sortedRows.value.length > limit.value);

/** Reaching the end of the drawn rows draws the next page. There is nothing to click. */
const moreSentinel = useTemplateRef('moreSentinel');
useIntersectionObserver(moreSentinel, ([entry]) => {
	if (entry?.isIntersecting && hasMore.value) limit.value += props.pageSize ?? Infinity;
});

const displayRows = computed(() =>
	sortedRows.value.slice(0, limit.value).map(({ model, presetLabel }) => ({
		model,
		presetLabel,
		// Labs that are also agent providers have an icon. Other labs get the default icon.
		iconCredentialType: isAgentModelProvider(model.lab)
			? getProviderCredentialTypes(model.lab)[0]
			: null,
		// Every feature, so each keeps its own place across the rows.
		features: FEATURES.map((feature) => ({ ...feature, present: feature.has(model) })),
		metrics: columns.value.map((column) => ({ ...column, value: metric(model, column.id) })),
	})),
);

function onSelect(modelId: string | undefined) {
	if (modelId) emit('select', modelId);
}
</script>

<template>
	<div
		ref="list"
		:class="$style.list"
		:style="{ '--model-picker--feature-count': FEATURES.length }"
	>
		<div :class="[$style.grid, $style.header]">
			<N8nText size="xsmall" color="text-light">
				{{ props.modelLabel ?? i18n.baseText('agents.modelPicker.column.model') }}
			</N8nText>
			<N8nText size="xsmall" color="text-light" :class="$style.features">
				{{ i18n.baseText('agents.modelPicker.column.features') }}
			</N8nText>
			<template v-for="column in columns" :key="column.id">
				<button
					type="button"
					:class="$style.sortButton"
					:data-testid="`agent-model-picker-sort-${column.id}`"
					@click="toggleSort(column.id)"
				>
					<N8nText size="xsmall" :color="sort?.id === column.id ? 'text-dark' : 'text-light'">
						{{ column.label }}
						<span v-if="sort?.id === column.id" aria-hidden="true">
							{{ sort.desc ? '↓' : '↑' }}
						</span>
						<N8nVisuallyHidden v-if="sort?.id === column.id">
							{{ sortState(column.id) }}
						</N8nVisuallyHidden>
					</N8nText>
				</button>
			</template>
		</div>

		<!-- One list for both uses. Read-only, it is a plain list of the same rows, with nothing to choose. -->
		<component
			:is="props.readonly ? 'ul' : N8nListbox"
			v-bind="
				props.readonly
					? { class: $style.readonlyRows, 'aria-label': props.label }
					: { modelValue: props.selectedModelId, label: props.label }
			"
			v-on="props.readonly ? {} : { 'update:modelValue': onSelect }"
		>
			<component
				:is="props.readonly ? 'li' : N8nListboxItem"
				v-for="row in displayRows"
				:key="row.model.id"
				v-bind="
					props.readonly
						? { class: $style.readonlyRow }
						: { class: $style.row, value: row.model.id }
				"
				data-testid="agent-model-picker-row"
			>
				<div :class="$style.grid">
					<div :class="$style.model">
						<span :class="$style.label">
							<span :class="$style.icon">
								<ModelSelectorTriggerIcon :credential-type-name="row.iconCredentialType" />
							</span>
							<N8nText size="small" :class="$style.name" :title="row.model.name">
								{{ row.model.name }}
							</N8nText>
						</span>
						<!-- Why the model is suggested: the design system's default badge beside the name, like the balance in the Providers menu. -->
						<N8nBadge
							v-if="row.presetLabel"
							:class="$style.preset"
							data-testid="agent-model-picker-preset"
						>
							{{ row.presetLabel }}
						</N8nBadge>
						<!--
							The option owns the selected state. This tick, like the one in the menus, only
							shows it. It follows the name, so the features and the bars can run to the
							right edge of the list.
						-->
						<N8nIcon
							v-if="row.model.id === props.selectedModelId"
							icon="check"
							size="large"
							color="text-light"
							aria-hidden="true"
							:class="$style.selected"
							data-testid="agent-model-picker-selected"
						/>
					</div>

					<!-- Each feature has its own place, so the icons line up down the list. A dot holds the place of one the model lacks. -->
					<div :class="[$style.features, $style.featureSlots]">
						<template v-for="feature in row.features" :key="feature.id">
							<N8nTooltip
								v-if="feature.present"
								:content="i18n.baseText(feature.labelKey)"
								placement="top"
								:enterable="false"
							>
								<N8nIcon
									:icon="feature.icon"
									size="small"
									color="text-light"
									:aria-label="i18n.baseText(feature.labelKey)"
								/>
							</N8nTooltip>
							<span v-else :class="$style.noFeature" aria-hidden="true" />
						</template>
					</div>

					<div
						v-for="column in row.metrics"
						:key="column.id"
						:class="[$style.metric, { [$style.sorted]: sort?.id === column.id }]"
					>
						<!-- An empty track keeps the row's rhythm when the catalog lists no value. -->
						<span :class="$style.meter" aria-hidden="true">
							<span
								v-if="column.value"
								:class="$style.meterFill"
								:style="{ width: column.value.width }"
							/>
						</span>
						<N8nText size="xsmall" color="text-light" :class="$style.metricValue">
							<N8nVisuallyHidden>{{ column.label }}</N8nVisuallyHidden>
							<template v-if="column.value">{{ column.value.text }}</template>
							<template v-else>
								<span aria-hidden="true" :class="$style.missing">
									{{ i18n.baseText('agents.modelPicker.metric.missingMark') }}
								</span>
								<N8nVisuallyHidden>
									{{ i18n.baseText('agents.modelPicker.metric.missing') }}
								</N8nVisuallyHidden>
							</template>
						</N8nText>
					</div>
				</div>
			</component>
		</component>
		<div v-if="hasMore" ref="moreSentinel" :class="$style.moreSentinel" aria-hidden="true" />
	</div>
</template>

<style module lang="scss">
@use '@n8n/design-system/css/mixins/focus';

/* Close to the end of the drawn rows, so the next page is ready before the user reaches it. */
.moreSentinel {
	height: var(--spacing--5xl);
	margin-top: calc(-1 * var(--spacing--5xl));
	pointer-events: none;
}

.list {
	/* Short bars, so the columns can stand apart and the features have room. */
	--model-picker--metric-width: calc(var(--spacing--lg) * 3);
	/* One place for each feature, exactly an icon wide, with a small gap between them. */
	--model-picker--feature-slot: var(--spacing--xs);
	--model-picker--feature-gap: var(--spacing--4xs);
	--model-picker--features-width: calc(
		var(--model-picker--feature-slot) * var(--model-picker--feature-count) +
			var(--model-picker--feature-gap) * (var(--model-picker--feature-count) - 1)
	);
	/* The features and the bars end at the right edge of the list. The names take the rest. */
	--model-picker--columns: minmax(0, 1fr) var(--model-picker--features-width)
		repeat(3, var(--model-picker--metric-width));
}

.grid {
	display: grid;
	grid-template-columns: var(--model-picker--columns);
	align-items: center;
	/* Wide enough that the tracks of neighbouring bars do not read as one line. */
	gap: var(--spacing--lg);
}

/*
 * Plain labels over a subtle line, like the product's selectable lists. The header
 * stays above the rows when the list scrolls, so it takes the dialog's own background.
 */
.header {
	position: sticky;
	top: 0;
	z-index: 1;
	padding: var(--spacing--2xs) var(--spacing--xs);
	border-bottom: var(--border-width) var(--border-style) var(--border-color--subtle);
	background-color: light-dark(var(--background--surface), var(--background--subtle));
}

/* The same space below the header line as above and below the other dividers in the picker. */
.header + * {
	padding-top: var(--spacing--2xs);
}

/*
 * The tick alone marks the selected model, as in the menus, so the row has no background
 * of its own and a background only ever means hover or keyboard focus. The listbox keeps
 * the selected row as its current one even when nothing points at it, so this row takes
 * its highlight from the pointer and from the keyboard instead.
 */
.row {
	--n8n-listbox-item--color--background--selected: transparent;

	&[data-state='checked'] {
		&:hover,
		&:focus-visible {
			background-color: var(--background--hover);
		}
	}
}

/* Read-only rows keep the measure of the options, without their hover or their pointer. */
.readonlyRows {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
	margin: 0;
	padding-right: 0;
	padding-bottom: 0;
	padding-left: 0;
	list-style: none;
}

.readonlyRow {
	display: flex;
	flex-direction: column;
	justify-content: center;
	min-height: var(--spacing--xl);
	padding: var(--spacing--2xs) var(--spacing--xs);
}

/* A header label that sorts the list. It looks like the plain labels until hovered. */
.sortButton {
	display: flex;
	padding: 0;
	border: none;
	background: none;
	font: inherit;
	text-align: left;
	cursor: pointer;

	&:hover span {
		color: var(--text-color);
	}

	&:focus-visible {
		@include focus.focus-ring;
	}
}

/* The name and why it is suggested share a line. In a narrow dialog the reason moves below the name. */
.model {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--spacing--5xs) var(--spacing--2xs);
	min-width: 0;
}

.label {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	min-width: 0;
	max-width: 100%;
}

/* The provider icons and the fallback icon have different widths. One slot keeps the names in line. */
.icon {
	display: inline-flex;
	flex-shrink: 0;
	justify-content: center;
	width: var(--spacing--md);
}

.name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* The reason keeps its words. A long model name gives way instead. */
.preset {
	flex-shrink: 0;
	white-space: nowrap;
}

.features {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
}

/* The tick of the selected model, straight after its name and the reason it is suggested. */
.selected {
	flex-shrink: 0;
}

/* The features of a row, each in its own place. */
.featureSlots {
	display: grid;
	grid-template-columns: repeat(
		var(--model-picker--feature-count),
		var(--model-picker--feature-slot)
	);
	justify-items: center;
	gap: var(--model-picker--feature-gap);
}

/* A feature the model lacks: a dot as quiet as the tracks of the bars. */
.noFeature {
	width: var(--spacing--5xs);
	height: var(--spacing--5xs);
	border-radius: var(--radius--full);
	background-color: var(--text-color--disabled);
}

.metric {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
	min-width: 0;
}

.meter {
	display: block;
	height: var(--spacing--4xs);
	border-radius: var(--radius--full);
	background-color: var(--border-color--subtle);
	overflow: hidden;
}

/*
 * The bars sit a step behind the model names. Sorting by a column brings its bars up to
 * full strength, so the eye has one column to follow.
 */
.meterFill {
	display: block;
	height: 100%;
	border-radius: var(--radius--full);
	background-color: var(--text-color--disabled);
}

.sorted .meterFill {
	background-color: var(--text-color--subtler);
}

.missing {
	color: var(--text-color--subtler);
}

.metricValue {
	font-variant-numeric: tabular-nums;
}

/* A narrow dialog keeps the numbers and the tick, and drops the bars and the features. */
@media (max-width: 480px) {
	.list {
		--model-picker--metric-width: var(--spacing--2xl);
		--model-picker--columns: minmax(0, 1fr) repeat(3, var(--model-picker--metric-width));
	}

	/* A cut name can hide the difference between two models. */
	.name {
		overflow-wrap: anywhere;
		white-space: normal;
	}

	.features,
	.meter {
		display: none;
	}
}
</style>
