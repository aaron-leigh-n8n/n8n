<script setup lang="ts">
import {
	N8nBadge,
	N8nButton,
	N8nCheckbox,
	N8nDropdownMenu,
	N8nIcon,
	N8nText,
	type DropdownMenuItemProps,
} from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { computed, reactive } from 'vue';

import {
	AGENT_MODEL_PROVIDER_DEFINITIONS,
	getProviderCredentialTypes,
	type AgentModelProvider,
} from '../../model-providers';
import ModelSelectorTriggerIcon from '../model-selector/ModelSelectorTriggerIcon.vue';
import type { ModelPickerConnection } from './modelPicker.utils';

interface ItemData {
	/** Shows the icon of this credential type. */
	credentialType?: string;
	description?: string;
	balance?: string;
}

type Item = DropdownMenuItemProps<string, ItemData>;

const props = withDefaults(
	defineProps<{
		connections: ModelPickerConnection[];
		/**
		 * `filter` turns providers on and off for the picker's lists.
		 * `choose` picks the one credential that runs a model, from the same rows.
		 */
		mode?: 'filter' | 'choose';
		/** In `choose` mode, the connection in use. */
		selectedId?: string;
		placement?: 'bottom-start' | 'bottom-end';
		disabled?: boolean;
		/** Class for the menu itself. */
		menuClass?: string;
	}>(),
	{
		mode: 'filter',
		selectedId: undefined,
		placement: 'bottom-end',
		disabled: false,
		menuClass: undefined,
	},
);

/** IDs of the connections whose models the picker lists. */
const enabledIds = defineModel<string[]>({ required: true });

const emit = defineEmits<{
	/** `provider` is set when the user starts from the menu of one provider. */
	createCredential: [provider?: AgentModelProvider];
	/** In `choose` mode, the connection the user picked. */
	choose: [connectionId: string];
}>();

const i18n = useI18n();

function isEnabled(connection: ModelPickerConnection): boolean {
	return enabledIds.value.includes(connection.id);
}

function setEnabled(connections: ModelPickerConnection[], enabled: boolean) {
	const ids = connections.map((connection) => connection.id);
	const others = enabledIds.value.filter((id) => !ids.includes(id));
	enabledIds.value = enabled ? [...others, ...ids] : others;
}

/** The credential each provider used last, so that turning the provider back on restores it. */
const lastCredentialIds = reactive(new Map<AgentModelProvider, string>());

/** Turns on one credential of a provider and turns off the others. */
function selectCredential(
	provider: AgentModelProvider,
	credentials: ModelPickerConnection[],
	connection: ModelPickerConnection,
) {
	// One write: the model value only updates after the parent re-renders.
	const ids = credentials.map((credential) => credential.id);
	enabledIds.value = [...enabledIds.value.filter((id) => !ids.includes(id)), connection.id];
	lastCredentialIds.set(provider, connection.id);
}

/** Turns a provider off, or back on with the credential it used last. */
function toggleProvider(provider: AgentModelProvider, credentials: ModelPickerConnection[]) {
	const enabled = credentials.find(isEnabled);
	if (enabled) {
		lastCredentialIds.set(provider, enabled.id);
		setEnabled(credentials, false);
		return;
	}
	const last = credentials.find((connection) => connection.id === lastCredentialIds.get(provider));
	selectCredential(provider, credentials, last ?? credentials[0]);
}

const gateways = computed(() =>
	props.connections.filter((connection) => connection.kind === 'gateway'),
);

const credentialsByProvider = computed(() => {
	const groups = new Map<AgentModelProvider, ModelPickerConnection[]>();
	for (const connection of props.connections) {
		const provider = connection.providers[0];
		if (connection.kind !== 'credential' || !provider) continue;
		groups.set(provider, [...(groups.get(provider) ?? []), connection]);
	}
	return groups;
});

const enabledCount = computed(
	() =>
		gateways.value.filter(isEnabled).length +
		[...credentialsByProvider.value.values()].filter((credentials) => credentials.some(isEnabled))
			.length,
);

/** The menu items, and the action that each item ID runs. */
const menu = computed(() => {
	const actions = new Map<string, () => void>();
	const createLabel = i18n.baseText('agents.modelSelector.configureCredentials');
	const choosing = props.mode === 'choose';

	const gatewayItems = gateways.value.map<Item>((connection) => {
		actions.set(connection.id, () => {
			if (!choosing) return setEnabled([connection], !isEnabled(connection));
			if (!isEnabled(connection)) setEnabled([connection], true);
			emit('choose', connection.id);
		});
		return {
			id: connection.id,
			label: connection.name,
			icon: { type: 'icon', value: 'wallet' },
			// Choosing marks the one connection in use with the menu's check.
			...(choosing
				? { checked: connection.id === props.selectedId }
				: { checkbox: true, checked: isEnabled(connection), keepOpen: true }),
			data: {
				balance: connection.balance
					? i18n.baseText('aiGateway.wallet.balanceRemaining', {
							interpolate: { balance: connection.balance },
						})
					: undefined,
			},
		};
	});

	const providerItems = [...credentialsByProvider.value].map<Item>(([provider, credentials]) => {
		const displayName = AGENT_MODEL_PROVIDER_DEFINITIONS[provider].displayName;
		const credentialType = getProviderCredentialTypes(provider)[0];

		actions.set(`provider:${provider}`, () => toggleProvider(provider, credentials));
		actions.set(`create:${provider}`, () => emit('createCredential', provider));

		const chosen = choosing
			? credentials.find((connection) => connection.id === props.selectedId)
			: undefined;

		return {
			id: `provider:${provider}`,
			label: displayName,
			// A click on the label turns the provider on or off. Choosing, the row only opens its credentials.
			...(choosing
				? {}
				: {
						checkbox: true,
						checked: credentials.some(isEnabled),
						selectable: true,
						keepOpen: true,
					}),
			data: {
				credentialType,
				// Choosing, the provider in use names its credential, since the row itself has no check.
				description:
					chosen?.name ??
					i18n.baseText('agents.modelPicker.credentialCount', {
						adjustToNumber: credentials.length,
						interpolate: { count: String(credentials.length) },
					}),
			},
			children: [
				{
					id: `header:${provider}`,
					label: i18n.baseText('agents.modelSelector.connectTo', {
						interpolate: { provider: displayName },
					}),
					header: true,
					disabled: true,
				},
				...credentials.map<Item>((connection) => {
					actions.set(connection.id, () => {
						// Either way it becomes the credential its provider uses, so the two menus agree.
						selectCredential(provider, credentials, connection);
						if (choosing) emit('choose', connection.id);
					});
					return {
						id: connection.id,
						label: connection.name,
						// One credential per provider is on. The menu marks it with a check.
						// Choosing, the check marks the one credential that runs the model.
						checked: choosing ? connection.id === props.selectedId : isEnabled(connection),
						keepOpen: !choosing,
						data: { credentialType },
					};
				}),
				{
					id: `create:${provider}`,
					label: createLabel,
					icon: { type: 'icon', value: 'plus' },
					divided: true,
					// The credential step takes focus, so the menu must not hand it back to its button.
					suppressCloseAutoFocus: true,
				},
			],
		};
	});

	actions.set('create', () => emit('createCredential'));

	const items: Item[] = [
		...gatewayItems,
		...providerItems,
		{
			id: 'create',
			// It leads to the provider list. A provider's own submenu creates a credential for it.
			label: i18n.baseText('agents.modelPicker.addProvider'),
			icon: { type: 'icon', value: 'plus' },
			divided: true,
			suppressCloseAutoFocus: true,
		},
	];
	return { items, actions };
});

function onSelect(id: string) {
	menu.value.actions.get(id)?.();
}

/**
 * A click on a provider row opens its credentials, so the row cannot also
 * toggle the provider. The checkbox of that row takes the click instead.
 */
function onCheckboxClick(event: MouseEvent, item: Item) {
	if (!item.children) return;
	event.stopPropagation();
	onSelect(item.id);
}
</script>

<template>
	<N8nDropdownMenu
		:items="menu.items"
		:placement="props.placement"
		:disabled="props.disabled"
		:extra-popper-class="props.menuClass"
		@select="onSelect"
	>
		<template #trigger>
			<slot name="trigger">
				<N8nButton variant="outline" data-testid="agent-model-picker-providers">
					{{
						i18n.baseText('agents.modelPicker.providers', {
							interpolate: { count: String(enabledCount) },
						})
					}}
					<N8nIcon icon="chevron-down" size="small" />
				</N8nButton>
			</slot>
		</template>

		<template #item-leading="{ item, ui }">
			<span :class="[ui.class, $style.leading]">
				<!-- The menu item owns the checked state. This box shows it. On a provider row it also takes the click. -->
				<span
					v-if="item.checkbox"
					:class="$style.checkbox"
					data-testid="agent-model-picker-provider-checkbox"
					@click="onCheckboxClick($event, item)"
				>
					<N8nCheckbox
						:model-value="item.checked"
						:class="$style.passive"
						tabindex="-1"
						aria-hidden="true"
					/>
				</span>
				<ModelSelectorTriggerIcon
					v-if="item.data?.credentialType"
					:credential-type-name="item.data.credentialType"
				/>
				<N8nIcon
					v-else-if="item.icon?.type === 'icon'"
					:icon="item.icon.value"
					color="text-light"
				/>
			</span>
		</template>

		<template #item-label="{ item, ui }">
			<span :class="[ui.class, $style.label]">
				<N8nText size="medium" color="text-dark">{{ item.label }}</N8nText>
				<N8nText v-if="item.data?.description" size="xsmall" color="text-light">
					{{ item.data.description }}
				</N8nText>
			</span>
		</template>

		<template #item-trailing="{ item, ui }">
			<N8nBadge v-if="item.data?.balance" :class="ui.class">{{ item.data.balance }}</N8nBadge>
			<!-- Room for the menu's tick on unticked credentials, so the menu keeps its width when the tick moves. -->
			<N8nIcon
				v-else-if="item.checked === false && !item.checkbox"
				icon="check"
				size="large"
				:class="[ui.class, $style.tickSpace]"
				aria-hidden="true"
			/>
		</template>
	</N8nDropdownMenu>
</template>

<style module lang="scss">
.leading {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.checkbox {
	display: inline-flex;
}

.tickSpace {
	visibility: hidden;
}

.passive {
	pointer-events: none;
}
.label {
	display: flex;
	flex-direction: column;
}
</style>
