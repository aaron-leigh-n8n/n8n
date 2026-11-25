<script setup lang="ts">
/**
 * ponytail: prototype-only experiment. See modelPickerPreview.ts for what it is
 * and how to remove it. The line under a provider's name: the models or labs it
 * names sit one tone below the provider's name, and the words around them, like
 * "and more", one tone below that.
 */
import { N8nText } from '@n8n/design-system';
import { I18nT } from 'vue-i18n';

import type { ProviderPreviewLine } from './modelPickerPreview';

defineProps<{ line: ProviderPreviewLine }>();
</script>

<template>
	<N8nText size="small" :class="$style.line" data-testid="agent-model-picker-provider-preview-line">
		<I18nT v-if="line.keypath" :keypath="line.keypath" scope="global">
			<template #names>
				<span :class="$style.names">{{ line.names }}</span>
			</template>
		</I18nT>
		<span v-else :class="$style.names">{{ line.names }}</span>
	</N8nText>
</template>

<style module lang="scss">
/*
 * A long list of names ends in an ellipsis and keeps the row one height.
 * The words around the names are the quietest text of the row: between the light
 * text and the disabled text, which alone would be too faint to read.
 */
.line {
	overflow: hidden;
	color: color-mix(in oklab, var(--text-color--subtler) 70%, var(--text-color--disabled));
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* The light text of the picker, a little heavier: below the provider's name, above the rest. */
.names {
	color: var(--text-color--subtler);
	font-weight: var(--font-weight--medium);
}
</style>
