<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { N8nBadge } from '@n8n/design-system';
import { useAiGatewayStore } from '@/app/stores/aiGateway.store';
import { useAiGatewayBalancePill } from '@/app/composables/useAiGatewayBalancePill';

const aiGatewayStore = useAiGatewayStore();

const { pill } = useAiGatewayBalancePill();
const text = computed(() => pill.value?.text);

// No enabled-check needed: this tag only mounts inside the n8n Connect
// section, which is only built when the AI gateway is enabled.
onMounted(() => {
	void aiGatewayStore.fetchWallet();
});
</script>

<template>
	<N8nBadge v-if="text" :class="$style.creditsBalance" data-test-id="node-creator-credits-balance">
		{{ text }}
	</N8nBadge>
</template>

<style lang="scss" module>
.creditsBalance {
	margin-right: var(--spacing--3xs);
}
</style>
