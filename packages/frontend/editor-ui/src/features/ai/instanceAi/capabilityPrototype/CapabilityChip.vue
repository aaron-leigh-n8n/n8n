<script setup lang="ts">
// Prototype only. One look for a capability: as an offer pill under the
// assistant's question, as a chip in the composer, and in the sent message.
import { N8nIcon } from '@n8n/design-system';
import { computed } from 'vue';

import { returnCapability } from './capabilityOffer';
import { CAPABILITIES } from './capabilityScript';

const props = defineProps<{
	capabilityId: string;
	/** Used when the id matches no known capability. */
	fallbackName?: string;
	/** `add` makes the whole chip a button. `remove` adds a remove button. */
	action?: 'add' | 'remove';
}>();

const emit = defineEmits<{ add: []; remove: [] }>();

const capability = computed(() => CAPABILITIES.find(({ id }) => id === props.capabilityId));
function remove() {
	returnCapability(props.capabilityId);
	emit('remove');
}

const name = computed(() => capability.value?.name ?? props.fallbackName ?? 'Tool');
</script>

<template>
	<component
		:is="action === 'add' ? 'button' : 'span'"
		:type="action === 'add' ? 'button' : undefined"
		:class="[$style.chip, { [$style.clickable]: action === 'add' }]"
		:data-test-id="`capability-chip-${capabilityId}`"
		@click="action === 'add' && emit('add')"
	>
		<N8nIcon :icon="capability?.icon ?? 'wrench'" :size="14" :class="$style.icon" />
		<span :class="$style.label">{{ name }}</span>
		<N8nIcon v-if="action === 'add'" icon="plus" :size="12" :class="$style.trailing" />
		<button
			v-else-if="action === 'remove'"
			type="button"
			:class="$style.remove"
			:aria-label="`Remove ${name}`"
			@click.stop="remove"
		>
			<N8nIcon icon="x" :size="12" />
		</button>
	</component>
</template>

<style lang="scss" module>
// One look in every place: a white chip in the light theme and in the dark theme.
.chip {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--3xs);
	padding: var(--spacing--3xs) var(--spacing--xs);
	border: var(--border-width) solid var(--color--neutral-200);
	border-radius: var(--radius--full);
	background: var(--color--neutral-white);
	box-shadow: var(--shadow--xs);
	color: var(--color--neutral-900);
	font-family: var(--font-family);
	font-size: var(--font-size--xs);
	font-weight: var(--font-weight--medium);
	line-height: var(--line-height--sm);
	white-space: nowrap;
}

.clickable {
	cursor: pointer;
	animation: capability-chip-in var(--duration--snappy) var(--easing--ease-out-quart) both;
	transition:
		background-color var(--duration--snappy) var(--easing--ease-out),
		border-color var(--duration--snappy) var(--easing--ease-out),
		transform var(--duration--snappy) var(--easing--ease-out);

	&:hover,
	&:focus-visible {
		background: var(--color--neutral-100);
		border-color: var(--color--neutral-300);
		transform: translateY(-1px);
		outline-color: var(--focus--border-color);
	}

	&:active {
		transform: translateY(0);
		box-shadow: none;
	}
}

.icon {
	color: var(--color--neutral-800);
	flex-shrink: 0;
}

.trailing {
	color: var(--color--neutral-600);
}

.remove {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 0;
	border: none;
	background: none;
	color: var(--color--neutral-600);
	cursor: pointer;

	&:hover,
	&:focus-visible {
		color: var(--color--neutral-900);
	}
}

@keyframes capability-chip-in {
	from {
		opacity: 0;
		transform: translateY(var(--spacing--4xs));
	}

	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.clickable {
		animation: none;
		transition: none;
	}
}
</style>
