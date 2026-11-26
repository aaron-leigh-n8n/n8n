<script lang="ts" setup>
import { N8nIcon, N8nLink, N8nText } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { usePremiumModelsUpgrade } from '@/app/composables/usePremiumModelsUpgrade';

/**
 * Shown under a model field when Gateway credits leaves the premium models out of the list.
 * The notice says why some models are missing and how to get them.
 */
defineProps<{
	/** Hides the "use your own credential" action where the host cannot switch credentials. */
	canUseOwnCredential?: boolean;
}>();

const emit = defineEmits<{
	useOwnCredential: [];
}>();

const i18n = useI18n();
const { openPremiumModelsUpgrade } = usePremiumModelsUpgrade();
</script>

<template>
	<div :class="$style.notice" data-test-id="premium-model-notice">
		<N8nIcon icon="info" size="small" :class="$style.icon" />
		<N8nText size="small" color="text-base">
			{{ `${i18n.baseText('aiGateway.premiumModels.field.notice')} ` }}
			<N8nLink size="small" data-test-id="premium-model-upgrade" @click="openPremiumModelsUpgrade">
				{{ i18n.baseText('aiGateway.premiumModels.field.upgrade') }}
			</N8nLink>
			<template v-if="canUseOwnCredential">
				{{ ` ${i18n.baseText('aiGateway.premiumModels.field.or')} ` }}
				<N8nLink
					size="small"
					data-test-id="premium-model-use-own"
					@click="emit('useOwnCredential')"
				>
					{{ i18n.baseText('aiGateway.premiumModels.field.useOwnCredential') }}
				</N8nLink>
			</template>
		</N8nText>
	</div>
</template>

<style lang="scss" module>
.notice {
	display: flex;
	align-items: flex-start;
	gap: var(--spacing--3xs);
	margin-top: var(--spacing--2xs);
}

.icon {
	flex: none;
	margin-top: var(--spacing--5xs);
	color: var(--color--text--tint-1);
}
</style>
