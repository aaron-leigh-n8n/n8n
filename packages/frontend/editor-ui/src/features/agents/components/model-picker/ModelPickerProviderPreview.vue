<script setup lang="ts">
/**
 * ponytail: prototype-only experiment. See modelPickerPreview.ts for what it is
 * and how to remove it. A read-only "Typically includes" section at the top of
 * the page that connects a provider: what the catalogue knows the provider
 * offers. It is the picker's own list, read-only, so the columns, the sorting
 * and the features are the same. The whole list is there and scrolls in a short
 * frame, like the list the shipped selector shows under a provider. The provider
 * confirms the list after connecting.
 */
import { N8nText } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { computed } from 'vue';

import { AGENT_MODEL_PROVIDER_DEFINITIONS, type AgentModelProvider } from '../../model-providers';
import type { ModelPickerModel } from './modelPicker.utils';
import ModelPickerList from './ModelPickerList.vue';
import type { ModelPickerMaxima } from './ModelPickerList.vue';
import { getProviderPreview } from './modelPickerPreview';

/** Rows the list draws at first, and adds each time its end scrolls into view, like the picker. */
const PAGE_SIZE = 100;

const props = defineProps<{
	provider: AgentModelProvider;
	/** The whole catalogue. */
	models: ModelPickerModel[];
	/** Largest value of each metric in the catalogue. The bars scale against it, as in the picker. */
	maxima: ModelPickerMaxima;
}>();

const i18n = useI18n();

const preview = computed(() => getProviderPreview(props.models, props.provider));
const rows = computed(() => preview.value.all.map((model) => ({ model })));

const listLabel = computed(() =>
	i18n.baseText('agents.modelPicker.preview.listLabel', {
		interpolate: { provider: AGENT_MODEL_PROVIDER_DEFINITIONS[props.provider].displayName },
	}),
);
</script>

<template>
	<section :class="$style.preview" data-testid="agent-model-picker-provider-preview">
		<!-- The list scrolls, so it takes focus for the keyboard. The frame around it shows the focus. -->
		<div v-if="rows.length > 0" :class="$style.frame">
			<div
				:class="$style.scroller"
				role="group"
				tabindex="0"
				:aria-label="listLabel"
				data-testid="agent-model-picker-provider-preview-list"
			>
				<ModelPickerList
					readonly
					:rows="rows"
					:label="listLabel"
					:model-label="i18n.baseText('agents.modelPicker.preview.heading')"
					:maxima="props.maxima"
					:page-size="PAGE_SIZE"
				/>
			</div>
		</div>
		<N8nText size="small" color="text-light" :class="$style.caption">
			{{
				i18n.baseText(
					rows.length > 0
						? 'agents.modelPicker.preview.caption'
						: 'agents.modelPicker.preview.captionNone',
				)
			}}
		</N8nText>
	</section>
</template>

<style module lang="scss">
@use '@n8n/design-system/css/mixins/focus';
@use '@n8n/design-system/css/mixins/mixins' as scrollbar-mixins;

/* A subtle line sets the preview apart from the credential form below, like the dividers of the picker. */
.preview {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	padding-bottom: var(--spacing--sm);
	border-bottom: var(--border-width) var(--border-style) var(--border-color--subtle);
}

/* The fade below would hide a focus ring on the list itself, so the frame around it draws it. */
.frame {
	border-radius: var(--radius--2xs);

	&:has(.scroller:focus-visible) {
		@include focus.focus-ring;
	}
}

/*
 * The header and three rows, so the credential form below keeps its first fields on
 * screen. The first row is whole and the next two fade out towards the bottom edge, the
 * design system's hint that a list scrolls on, over the same length as the picker's other
 * lists. The height counts the header and two rows, each a row high with a gap, and the
 * room the last row takes. The space under the last row keeps its text clear of the fade
 * at the end of the list. A shorter list takes only the height it needs.
 */
$fade: calc(var(--spacing--xl) * 3);
$fade-clearance: calc(var(--spacing--xl) * 2.5);

.scroller {
	max-height: calc(var(--spacing--xl) * 3 + var(--spacing--2xs) * 3 + var(--spacing--2xl));
	/* Positioned, so the hidden labels of the rows scroll with the list and add no height to the page. */
	position: relative;
	padding-bottom: $fade-clearance;
	overflow-y: auto;
	outline: none;

	@include scrollbar-mixins.scroll-bar;
	@include scrollbar-mixins.scroll-mask(bottom, $fade);
}

.caption {
	padding: 0 var(--spacing--xs);
}
</style>
