<script setup lang="ts">
/**
 * Model picker for the agent builder: a trigger row that opens a dialog with
 * suggested models and the full, filterable model list.
 */
import {
	N8nButton,
	N8nCheckbox,
	N8nDropdownMenu,
	N8nEmptyState,
	N8nIcon,
	N8nInput,
	N8nListbox,
	N8nListboxItem,
	N8nText,
	N8nTooltip,
	type DropdownMenuItemProps,
} from '@n8n/design-system';
import { useI18n, type BaseTextKey } from '@n8n/i18n';
import sortBy from 'lodash/sortBy';
import {
	computed,
	defineAsyncComponent,
	nextTick,
	reactive,
	ref,
	useTemplateRef,
	watch,
} from 'vue';
import { I18nT } from 'vue-i18n';

import type { ICredentialsResponse } from '@/features/credentials/credentials.types';

import {
	AGENT_MODEL_PROVIDER_DEFINITIONS,
	AGENT_MODEL_PROVIDERS,
	getProviderCredentialTypes,
	isAgentModelProvider,
	type AgentModelProvider,
} from '../../model-providers';
import shared from '../../styles/agent-panel.module.scss';
import AgentModalMultiStep from '../modals/AgentModalMultiStep.vue';
import ModelSelectorTriggerIcon from '../model-selector/ModelSelectorTriggerIcon.vue';
import { FAKE_MODEL_CATALOG } from './fakeModelCatalog';
import { MODEL_PICKER_SCENARIOS, useModelPickerScenario } from './modelPickerScenarios';
import {
	connectionsForModel,
	filterModels,
	getPresets,
	MODEL_PICKER_FEATURES,
	pickConnection,
	type ModelPickerConnection,
	type ModelPickerCostFilter,
	type ModelPickerFeature,
	type ModelPickerFilters,
	type ModelPickerModel,
	type ModelPickerPresetId,
	type ModelPickerSelection,
} from './modelPicker.utils';
import ModelPickerList from './ModelPickerList.vue';
// Preview experiment. See modelPickerPreview.ts.
import { getProviderPreview, providerPreviewLine } from './modelPickerPreview';
import ModelPickerProviderLine from './ModelPickerProviderLine.vue';
import ModelPickerProviderPreview from './ModelPickerProviderPreview.vue';
import ModelPickerProviders from './ModelPickerProviders.vue';

/** Loaded on first use. It brings the credential editor, which the model list does not need. */
const ModelPickerCredentialForm = defineAsyncComponent(
	async () => await import('./ModelPickerCredentialForm.vue'),
);

const PRESET_LABELS: Record<ModelPickerPresetId, BaseTextKey> = {
	recommended: 'agents.modelPicker.preset.recommended',
	cheaper: 'agents.modelPicker.preset.cheaper',
	largestContext: 'agents.modelPicker.preset.largestContext',
};
const COST_LABELS: Record<ModelPickerCostFilter, BaseTextKey> = {
	any: 'agents.modelPicker.cost.any',
	free: 'agents.modelPicker.cost.free',
	upTo1: 'agents.modelPicker.cost.upTo1',
	upTo5: 'agents.modelPicker.cost.upTo5',
};

const props = withDefaults(
	defineProps<{
		/** Models to offer. The fake catalog is the default until the real catalog is connected. */
		models?: ModelPickerModel[];
		/** Gateway credits and credentials that can pay for model calls. The prototype scenario sets them when omitted. */
		connections?: ModelPickerConnection[];
		disabled?: boolean;
	}>(),
	{
		models: () => FAKE_MODEL_CATALOG,
		connections: undefined,
		disabled: false,
	},
);

/** The model and the connection that pays for it. Kept in the picker when the host does not bind it. */
const selection = defineModel<ModelPickerSelection | null>('selection', { default: null });

const i18n = useI18n();
const searchInput = useTemplateRef('searchInput');
const credentialForm = useTemplateRef('credentialForm');

const open = ref(false);
const step = ref<'select' | 'list' | 'credential'>('select');

const { scenario, skipKeyCheck, previewModels } = useModelPickerScenario();
const startConnections = computed(
	() => props.connections ?? MODEL_PICKER_SCENARIOS[scenario.value].connections,
);

/** Credentials created in the picker. The fake connections do not come from the server, so the picker keeps them. */
const createdConnections = ref<ModelPickerConnection[]>([]);
const allConnections = computed(() => [...startConnections.value, ...createdConnections.value]);

/** All gateways, and the first credential of each provider. A provider uses one credential at a time. */
function defaultEnabledIds(list: ModelPickerConnection[]): string[] {
	return list
		.filter(
			(connection, index, all) =>
				connection.kind !== 'credential' ||
				all.findIndex(
					(other) => other.kind === 'credential' && other.providers[0] === connection.providers[0],
				) === index,
		)
		.map((connection) => connection.id);
}
const enabledConnectionIds = ref(defaultEnabledIds(startConnections.value));
const filters = reactive<ModelPickerFilters>({ search: '', features: [], cost: 'any' });

const enabledConnections = computed(() =>
	allConnections.value.filter((connection) => enabledConnectionIds.value.includes(connection.id)),
);
const availableModels = computed(() =>
	props.models.filter((model) => connectionsForModel(model, enabledConnections.value).length > 0),
);

const presetRows = computed(() =>
	getPresets(availableModels.value).map(({ id, model }) => ({
		model,
		presetLabel: i18n.baseText(PRESET_LABELS[id]),
	})),
);

/**
 * The first page: the selected model first when it is not a suggestion, so the
 * active model is always in view, then the suggestions.
 */
const suggestionRows = computed(() => {
	const model = selectedModel.value;
	if (!model || presetRows.value.some((row) => row.model.id === model.id)) {
		return presetRows.value;
	}
	// Its tick says it is the selected model, so it needs no label.
	return [{ model, presetLabel: undefined }, ...presetRows.value];
});

/** The filtered list, with the suggested models first, in the order of the suggestions. */
const allRows = computed(() => {
	const presetIds = presetRows.value.map((row) => row.model.id);
	return sortBy(
		filterModels(availableModels.value, filters).map((model) => ({
			model,
			presetLabel: presetRows.value[presetIds.indexOf(model.id)]?.presetLabel,
		})),
		({ model }) => (presetIds.includes(model.id) ? presetIds.indexOf(model.id) : presetIds.length),
	);
});

const maxima = computed(() => ({
	context: Math.max(0, ...props.models.map((model) => model.limits?.context ?? 0)),
	input: Math.max(0, ...props.models.map((model) => model.cost?.input ?? 0)),
	output: Math.max(0, ...props.models.map((model) => model.cost?.output ?? 0)),
}));

/** Preview experiment: what the catalogue says each provider offers. */
const providerPreviews = computed(
	() =>
		new Map(
			AGENT_MODEL_PROVIDERS.map((provider) => [
				provider,
				getProviderPreview(props.models, provider),
			]),
		),
);

const selectedModel = computed(() =>
	props.models.find((model) => model.id === selection.value?.modelId),
);
const selectedConnection = computed(() =>
	allConnections.value.find((connection) => connection.id === selection.value?.connectionId),
);
const triggerIconCredentialType = computed(() => {
	const lab = selectedModel.value?.lab;
	return lab && isAgentModelProvider(lab) ? getProviderCredentialTypes(lab)[0] : null;
});

/** Every provider, with the ones that serve the selected model first. */
const createProviders = computed(() => {
	const serving = selectedModel.value?.providers ?? [];
	return [...serving, ...AGENT_MODEL_PROVIDERS.filter((provider) => !serving.includes(provider))];
});

/** Every connection that can run the selected model, whether or not the picker lists its provider. */
const modelConnections = computed(() =>
	selectedModel.value ? connectionsForModel(selectedModel.value, allConnections.value) : [],
);
/**
 * The Credential field is always on the page. It is greyed out until a model is
 * selected, which takes a connected provider, so there is something to choose.
 */
const credentialDisabled = computed(() => props.disabled || !selectedConnection.value);

const featureItems = computed<DropdownMenuItemProps[]>(() =>
	(Object.keys(MODEL_PICKER_FEATURES) as ModelPickerFeature[]).map((feature) => ({
		id: feature,
		label: i18n.baseText(MODEL_PICKER_FEATURES[feature].labelKey),
		checkbox: true,
		checked: filters.features.includes(feature),
		keepOpen: true,
	})),
);

const costItems = computed<Array<DropdownMenuItemProps<ModelPickerCostFilter>>>(() =>
	(['any', 'free', 'upTo1', 'upTo5'] as const).map((cost) => ({
		id: cost,
		label: i18n.baseText(COST_LABELS[cost]),
		checked: filters.cost === cost,
	})),
);

function openPicker() {
	if (props.disabled) return;
	// Preview experiment: with nothing connected, the provider list is the first page.
	// It shows what each provider offers, so the empty page before it has nothing to add.
	if (previewModels.value && allConnections.value.length === 0) {
		startCredential([], 'select', true);
		return;
	}
	credentialFlow.value = null;
	step.value = 'select';
	open.value = true;
}

async function showAllModels() {
	step.value = 'list';
	await nextTick();
	searchInput.value?.focus();
}

/**
 * The first page has a search too. Typing in it opens the full list with the
 * query, and the list's own search takes over, so the person can keep typing.
 */
const quickSearch = ref('');
watch(quickSearch, (query) => {
	if (!query) return;
	filters.search = query;
	quickSearch.value = '';
	void showAllModels();
});

function selectModel(modelId: string) {
	const model = props.models.find((candidate) => candidate.id === modelId);
	const connection =
		model && pickConnection(model, enabledConnections.value, selection.value?.connectionId);
	if (!connection) return;
	selection.value = { modelId, connectionId: connection.id };
	open.value = false;
}

function selectConnection(connectionId: string) {
	if (selection.value) selection.value = { ...selection.value, connectionId };
}

/** Starts from the Credential field: one provider's menu, or every provider with the model's first. */
function onCredentialFieldCreate(provider?: AgentModelProvider) {
	startCredential(provider ? [provider] : createProviders.value, null);
}

/** Shows the whole list again. */
function clearFilters() {
	filters.search = '';
	filters.features = [];
	filters.cost = 'any';
	searchInput.value?.focus();
}

function toggleFeature(id: string) {
	if (!(id in MODEL_PICKER_FEATURES)) return;
	const feature = id as ModelPickerFeature;
	filters.features = filters.features.includes(feature)
		? filters.features.filter((candidate) => candidate !== feature)
		: [...filters.features, feature];
}

/**
 * Creating a credential: the providers to choose from, the chosen one, and the
 * step to return to. No return step means the flow started outside the dialog,
 * so saving closes it.
 */
const credentialFlow = ref<{
	providers: AgentModelProvider[];
	provider?: AgentModelProvider;
	returnStep: 'select' | 'list' | null;
	/** Preview experiment: the provider list is the picker's first page, so it has no Back. */
	root?: boolean;
} | null>(null);

const credentialProvider = computed(() => credentialFlow.value?.provider);

/**
 * The model step on show, or the one the credential step goes back to. The toolbar keeps
 * that step's controls while the credential step hides it.
 */
const modelStep = computed(() =>
	step.value === 'credential' ? (credentialFlow.value?.returnStep ?? 'select') : step.value,
);

/**
 * Narrows the provider choice by the provider's name only. A model's name finds nothing
 * here: listing the providers that carry a model would promise it before a credential
 * has confirmed it.
 */
const providerSearch = ref('');
const providerSearchInput = useTemplateRef('providerSearchInput');
const providerChoices = computed(() => {
	const providers = credentialFlow.value?.providers ?? [];
	const query = providerSearch.value.trim().toLowerCase();
	if (!query) return providers;
	return providers.filter((provider) =>
		AGENT_MODEL_PROVIDER_DEFINITIONS[provider].displayName.toLowerCase().includes(query),
	);
});
/** Preview experiment: one line under each provider's name. */
const providerPreviewLines = computed(
	() =>
		new Map(
			providerChoices.value.map((provider) => {
				const preview = providerPreviews.value.get(provider);
				return [provider, preview && providerPreviewLine(preview)] as const;
			}),
		),
);

/** The search takes focus whenever the provider choice appears, so typing filters at once. */
async function focusProviderSearch() {
	providerSearch.value = '';
	await nextTick();
	providerSearchInput.value?.focus();
}

/** Enter in the search picks the first match. */
function chooseFirstProvider() {
	const [first] = providerChoices.value;
	if (first) chooseCredentialProvider(first);
}

function startCredential(
	providers: readonly AgentModelProvider[],
	returnStep: 'select' | 'list' | null,
	root = false,
) {
	const choices = providers.length > 0 ? [...providers] : [...AGENT_MODEL_PROVIDERS];
	credentialFlow.value = {
		providers: choices,
		provider: choices.length === 1 ? choices[0] : undefined,
		returnStep,
		root,
	};
	step.value = 'credential';
	open.value = true;
	if (!credentialFlow.value.provider) void focusProviderSearch();
}

/** Starts from the Providers menu, which can open on either step. */
function onProvidersCreate(provider?: AgentModelProvider) {
	if (step.value === 'credential') return;
	startCredential(provider ? [provider] : [], step.value);
}

function chooseCredentialProvider(provider: string | undefined) {
	const flow = credentialFlow.value;
	if (flow && provider && isAgentModelProvider(provider)) flow.provider = provider;
}

const canGoBack = computed(() => {
	if (step.value === 'list') return true;
	const flow = credentialFlow.value;
	if (step.value !== 'credential' || !flow) return false;
	if (flow.root && !flow.provider) return false;
	return Boolean(flow.returnStep) || (Boolean(flow.provider) && flow.providers.length > 1);
});

function goBack() {
	const flow = credentialFlow.value;
	if (step.value !== 'credential' || !flow) {
		step.value = 'select';
		return;
	}
	if (flow.provider && flow.providers.length > 1) {
		flow.provider = undefined;
		void focusProviderSearch();
		return;
	}
	step.value = flow.returnStep ?? 'select';
	credentialFlow.value = null;
}

const credentialTitle = computed(() =>
	credentialProvider.value
		? i18n.baseText('agents.modelSelector.connectTo', {
				interpolate: {
					provider: AGENT_MODEL_PROVIDER_DEFINITIONS[credentialProvider.value].displayName,
				},
			})
		: // Preview experiment: the list is for looking as well as connecting, so it is named for the choice.
			i18n.baseText(
				credentialFlow.value?.root
					? 'agents.modelPicker.empty.heading'
					: previewModels.value
						? 'agents.modelPicker.credential.chooseProvider'
						: 'agents.modelSelector.configureCredentials',
			),
);

/** Adds the new credential, makes it the one its provider uses, and selects it when it serves the model. */
function onCredentialCreated(credential: ICredentialsResponse) {
	const flow = credentialFlow.value;
	const provider = flow?.provider;
	if (!flow || !provider) return;

	const connection: ModelPickerConnection = {
		id: credential.id,
		name: credential.name,
		kind: 'credential',
		providers: [provider],
	};
	createdConnections.value = [...createdConnections.value, connection];
	const sameProvider = allConnections.value
		.filter((other) => other.kind === 'credential' && other.providers[0] === provider)
		.map((other) => other.id);
	enabledConnectionIds.value = [
		...enabledConnectionIds.value.filter((id) => !sameProvider.includes(id)),
		connection.id,
	];

	const model = selectedModel.value;
	const servesModel = model?.providers.includes(provider);
	const selectionOff = !enabledConnectionIds.value.includes(selection.value?.connectionId ?? '');
	if (model && servesModel && (flow.returnStep === null || selectionOff)) {
		selection.value = { modelId: model.id, connectionId: connection.id };
	}

	credentialFlow.value = null;
	if (flow.returnStep) step.value = flow.returnStep;
	else open.value = false;
}

/** A new scenario starts the walkthrough again: nothing created, nothing selected. */
watch(startConnections, (list) => {
	open.value = false;
	step.value = 'select';
	credentialFlow.value = null;
	createdConnections.value = [];
	enabledConnectionIds.value = defaultEnabledIds(list);
	selection.value = null;
	selectRecommended();
});

/**
 * With providers connected, the agent starts on the recommended model, like the
 * product's default when a credential can run it. With none, it stays a draft.
 */
function selectRecommended() {
	if (selection.value) return;
	const recommended = getPresets(availableModels.value).find(({ id }) => id === 'recommended');
	const connection = recommended && pickConnection(recommended.model, enabledConnections.value);
	if (recommended && connection) {
		selection.value = { modelId: recommended.model.id, connectionId: connection.id };
	}
}
selectRecommended();

defineExpose({ open: openPicker });
</script>

<template>
	<div :class="$style.root">
		<div :class="$style.trigger" :data-disabled="props.disabled ? '' : undefined">
			<button
				type="button"
				:class="$style.open"
				:disabled="props.disabled"
				data-testid="agent-model-picker-trigger"
				@click="openPicker"
			>
				<ModelSelectorTriggerIcon :credential-type-name="triggerIconCredentialType" />
				<N8nText size="small" bold :class="$style.selectedName">
					{{ selectedModel?.name ?? i18n.baseText('agents.modelSelector.defaultLabel') }}
				</N8nText>
			</button>

			<N8nIcon icon="arrow-right" size="small" :class="$style.arrow" />
		</div>

		<!--
			The credential that runs the selected model: a field of its own under the model.
			With nothing connected it stays on the page, greyed out, with a placeholder.
		-->
		<div :class="$style.credentialField">
			<div :class="[$style.fieldLabel, props.disabled && shared.disabled]">
				<N8nText step="sm" bold :class="shared.dataEntryLabel">
					{{ i18n.baseText('agents.modelPicker.credential.label') }}
					<N8nText step="sm" bold color="danger">*</N8nText>
				</N8nText>
				<N8nText step="sm" color="text-light">
					{{ i18n.baseText('agents.modelPicker.credential.description') }}
				</N8nText>
			</div>
			<!--
				The Providers menu of the picker, choosing one credential: the same rows, for the
				providers that serve the model. Greyed out, a tooltip says what to do first.
			-->
			<N8nTooltip
				:content="i18n.baseText('agents.modelPicker.credential.unavailable')"
				:disabled="props.disabled || !!selectedConnection"
				placement="top"
			>
				<ModelPickerProviders
					v-model="enabledConnectionIds"
					mode="choose"
					:connections="modelConnections"
					:selected-id="selectedConnection?.id"
					:disabled="credentialDisabled"
					placement="bottom-start"
					:menu-class="$style.credentialMenu"
					@choose="selectConnection"
					@create-credential="onCredentialFieldCreate"
				>
					<template #trigger>
						<button
							type="button"
							:class="[$style.trigger, $style.credentialTrigger]"
							:disabled="credentialDisabled"
							:data-disabled="credentialDisabled ? '' : undefined"
							:aria-label="
								selectedConnection
									? i18n.baseText('agents.modelPicker.connection', {
											interpolate: { name: selectedConnection.name },
										})
									: i18n.baseText('agents.modelPicker.credential.label')
							"
							data-testid="agent-model-picker-connection"
						>
							<N8nText size="small" bold :class="$style.selectedName">
								{{
									selectedConnection?.name ??
									i18n.baseText('agents.modelPicker.credential.placeholder')
								}}
							</N8nText>
							<N8nIcon icon="chevron-down" size="small" :class="$style.arrow" />
						</button>
					</template>
				</ModelPickerProviders>
			</N8nTooltip>
		</div>

		<AgentModalMultiStep
			:open="open"
			:step="step"
			:title="
				step === 'credential' ? credentialTitle : i18n.baseText('agents.builder.agent.model.label')
			"
			:show-back="canGoBack"
			:show-footer="step === 'credential' && Boolean(credentialProvider)"
			:busy="credentialForm?.isSaving ?? false"
			data-testid="agent-model-picker-modal"
			@update:open="open = $event"
			@back="goBack"
		>
			<template v-if="step === 'credential' && credentialProvider" #titlePrefix>
				<ModelSelectorTriggerIcon
					:credential-type-name="getProviderCredentialTypes(credentialProvider)[0]"
				/>
			</template>

			<div
				v-if="step === 'credential' && credentialFlow"
				:class="[$style.credentialStep, { [$style.connectStep]: credentialFlow.provider }]"
			>
				<!--
					Preview experiment: what the provider offers, above its credential form.
					The form is long, so below it the preview would be off screen.
				-->
				<ModelPickerProviderPreview
					v-if="previewModels && credentialFlow.provider"
					:key="credentialFlow.provider"
					:provider="credentialFlow.provider"
					:models="props.models"
					:maxima="maxima"
				/>
				<ModelPickerCredentialForm
					v-if="credentialFlow.provider"
					ref="credentialForm"
					:key="credentialFlow.provider"
					:check-key="!skipKeyCheck"
					:provider="credentialFlow.provider"
					@created="onCredentialCreated"
				/>
				<div v-else :class="$style.providerChoice">
					<N8nInput
						ref="providerSearchInput"
						v-model="providerSearch"
						:placeholder="i18n.baseText('agents.modelPicker.credential.searchProviders')"
						clearable
						data-testid="agent-model-picker-provider-search"
						@keydown.enter.prevent="chooseFirstProvider"
					>
						<template #prefix><N8nIcon icon="search" /></template>
					</N8nInput>
					<!-- The list scrolls under the search, like the model list. -->
					<div v-if="providerChoices.length > 0" :class="$style.scroll">
						<N8nListbox
							:label="i18n.baseText('agents.modelPicker.credential.chooseProvider')"
							@update:model-value="chooseCredentialProvider"
						>
							<N8nListboxItem
								v-for="provider in providerChoices"
								:key="provider"
								:value="provider"
								:data-testid="`agent-model-picker-credential-provider-${provider}`"
							>
								<template #leading>
									<ModelSelectorTriggerIcon
										:credential-type-name="getProviderCredentialTypes(provider)[0]"
									/>
								</template>
								<N8nText size="medium" color="text-dark">
									{{ AGENT_MODEL_PROVIDER_DEFINITIONS[provider].displayName }}
								</N8nText>
								<!-- Preview experiment: the provider's top models, or the labs it carries. -->
								<ModelPickerProviderLine
									v-if="previewModels && providerPreviewLines.get(provider)"
									:line="providerPreviewLines.get(provider)!"
								/>
								<template #trailing>
									<N8nIcon icon="chevron-right" size="small" color="text-light" />
								</template>
							</N8nListboxItem>
						</N8nListbox>
					</div>
					<N8nEmptyState
						v-else
						:icon="{ type: 'icon', value: 'search' }"
						:heading="i18n.baseText('agents.modelPicker.credential.noProviders')"
						:description="i18n.baseText('agents.modelPicker.credential.noProvidersHint')"
						:class="$style.emptyState"
					/>
				</div>
			</div>

			<!--
				The two model steps share the dialog's step frame, with the hint below them.
				Hidden, not removed, on the credential step, so Back finds them as they were.
			-->
			<div v-show="step !== 'credential'" :class="$style.modelSteps">
				<!--
					One row for the search and every filter, shared by both model steps, so
					Providers keeps its place from one step to the other. Each step shows its own
					search, and the filters of the full list show on that step only. The row is
					hidden, not removed, on the credential step: the dialog's focus trap remembers
					the Providers button while its menu is open, and if the button left the page
					the trap would pull focus out of the provider search. With nothing connected
					there is nothing to search or filter, so the row is left out.
				-->
				<div v-if="allConnections.length > 0" :class="$style.toolbar">
					<N8nInput
						v-show="modelStep === 'select'"
						v-model="quickSearch"
						:class="$style.search"
						:placeholder="i18n.baseText('agents.modelPicker.search.placeholder')"
						:disabled="availableModels.length === 0"
						data-agent-modal-autofocus
						data-testid="agent-model-picker-quick-search"
					>
						<template #prefix><N8nIcon icon="search" /></template>
					</N8nInput>
					<N8nInput
						v-show="modelStep === 'list'"
						ref="searchInput"
						v-model="filters.search"
						:class="$style.search"
						:placeholder="i18n.baseText('agents.modelPicker.search.placeholder')"
						clearable
						data-testid="agent-model-picker-search"
					>
						<template #prefix><N8nIcon icon="search" /></template>
					</N8nInput>
					<template v-if="modelStep === 'list'">
						<N8nDropdownMenu :items="featureItems" placement="bottom-end" @select="toggleFeature">
							<template #trigger>
								<N8nButton variant="outline" data-testid="agent-model-picker-features">
									{{
										filters.features.length > 0
											? i18n.baseText('agents.modelPicker.filter.featuresCount', {
													interpolate: { count: String(filters.features.length) },
												})
											: i18n.baseText('agents.modelPicker.filter.features')
									}}
									<N8nIcon icon="chevron-down" size="small" />
								</N8nButton>
							</template>
							<template #item-leading="{ item, ui }">
								<!-- The menu item owns the checked state. This box only shows it. -->
								<N8nCheckbox
									:model-value="item.checked"
									:class="[ui.class, $style.passive]"
									tabindex="-1"
									aria-hidden="true"
								/>
							</template>
						</N8nDropdownMenu>

						<N8nDropdownMenu
							:items="costItems"
							placement="bottom-end"
							@select="filters.cost = $event"
						>
							<template #trigger>
								<N8nButton variant="outline" data-testid="agent-model-picker-cost">
									{{
										i18n.baseText(
											filters.cost === 'any'
												? 'agents.modelPicker.filter.cost'
												: COST_LABELS[filters.cost],
										)
									}}
									<N8nIcon icon="chevron-down" size="small" />
								</N8nButton>
							</template>
						</N8nDropdownMenu>
					</template>
					<ModelPickerProviders
						v-model="enabledConnectionIds"
						:connections="allConnections"
						@create-credential="onProvidersCreate"
					/>
				</div>

				<!-- Both steps stay mounted, so Back keeps the search, the filters, and the scroll position. -->
				<div
					v-show="step === 'select'"
					:class="[$style.step, { [$style.fill]: allConnections.length > 0 }]"
				>
					<N8nEmptyState
						v-if="allConnections.length === 0"
						:icon="{ type: 'icon', value: 'key-round' }"
						:heading="i18n.baseText('agents.modelPicker.empty.heading')"
						:description="i18n.baseText('agents.modelPicker.empty.description')"
						:button-text="i18n.baseText('agents.modelSelector.configureCredentials')"
						button-icon="plus"
						:class="$style.emptyState"
						data-testid="agent-model-picker-empty"
						@click:button="startCredential([], 'select')"
					/>
					<ModelPickerList
						v-else-if="suggestionRows.length > 0"
						:rows="suggestionRows"
						:label="i18n.baseText('agents.modelPicker.suggested')"
						:selected-model-id="selection?.modelId"
						:maxima="maxima"
						@select="selectModel"
					/>
					<N8nEmptyState
						v-else
						:icon="{ type: 'icon', value: 'key-round' }"
						:heading="i18n.baseText('agents.modelPicker.noProviders.heading')"
						:description="i18n.baseText('agents.modelPicker.noProviders.description')"
						:class="$style.emptyState"
						data-testid="agent-model-picker-no-providers"
					/>
					<div v-if="allConnections.length > 0" :class="$style.allModelsRow">
						<N8nButton
							variant="ghost"
							:class="$style.allModels"
							:disabled="availableModels.length === 0"
							data-testid="agent-model-picker-show-all"
							@click="showAllModels"
						>
							{{
								i18n.baseText('agents.modelPicker.allModels', {
									adjustToNumber: availableModels.length,
									interpolate: { count: String(availableModels.length) },
								})
							}}
							<N8nIcon icon="arrow-right" size="small" />
						</N8nButton>
					</div>
				</div>

				<div v-show="step === 'list'" :class="[$style.step, $style.listStep]">
					<div :class="$style.scroll">
						<ModelPickerList
							v-if="allRows.length > 0"
							:rows="allRows"
							:label="i18n.baseText('agents.modelPicker.allModelsLabel')"
							:selected-model-id="selection?.modelId"
							:maxima="maxima"
							:page-size="100"
							@select="selectModel"
						/>
						<N8nEmptyState
							v-else-if="availableModels.length > 0"
							:icon="{ type: 'icon', value: 'search' }"
							:heading="i18n.baseText('agents.modelPicker.noMatch.heading')"
							:description="i18n.baseText('agents.modelPicker.noMatch.description')"
							:button-text="i18n.baseText('agents.modelPicker.noMatch.clear')"
							button-variant="outline"
							:class="$style.emptyState"
							data-testid="agent-model-picker-no-match"
							@click:button="clearFilters"
						/>
						<N8nEmptyState
							v-else
							:icon="{ type: 'icon', value: 'key-round' }"
							:heading="i18n.baseText('agents.modelPicker.noProviders.heading')"
							:description="i18n.baseText('agents.modelPicker.noProviders.description')"
							:class="$style.emptyState"
						/>
					</div>
				</div>

				<!-- Always in view on both steps: more models come from connecting another provider. -->
				<N8nText
					v-if="allConnections.length > 0"
					tag="p"
					size="small"
					color="text-light"
					:class="$style.moreHint"
					data-testid="agent-model-picker-more-hint"
				>
					<I18nT keypath="agents.modelPicker.moreHint.text" scope="global">
						<template #action>
							<button type="button" :class="$style.moreHintAction" @click="onProvidersCreate()">
								{{ i18n.baseText('agents.modelPicker.moreHint.action') }}
							</button>
						</template>
					</I18nT>
				</N8nText>
			</div>

			<template v-if="step === 'credential' && credentialProvider" #footerActions>
				<N8nButton
					variant="solid"
					:loading="credentialForm?.isSaving ?? false"
					data-testid="agent-model-picker-credential-save"
					@click="credentialForm?.save()"
				>
					{{ i18n.baseText('generic.save') }}
				</N8nButton>
			</template>
		</AgentModalMultiStep>
	</div>
</template>

<style module lang="scss">
@use '@n8n/design-system/css/mixins/focus';
@use '@n8n/design-system/css/mixins/mixins' as scrollbar-mixins;

.providerChoice {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--xs);
	/*
	 * The same height as the model steps, so the dialog does not shrink while the search
	 * filters, and the list scrolls under the search.
	 */
	height: min(60dvh, calc(var(--height--5xl) * 5));
}

.credentialStep {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
}

/*
 * Connecting a provider keeps the dialog at the height of its other steps: the step frame,
 * less the footer that only this step has (its padding, its buttons and its line). A form
 * too long for it scrolls here, with the same fade as the lists. The space at the sides
 * keeps the focus ring of a field inside the frame.
 */
.connectStep {
	position: relative;
	box-sizing: border-box;
	height: calc(
		min(60dvh, calc(var(--height--5xl) * 5)) - var(--spacing--md) *
			2 - var(--height--md) - var(--border-width)
	);
	margin-inline: calc(-1 * var(--spacing--4xs));
	padding: 0 var(--spacing--4xs) var(--spacing--sm);
	overflow-y: auto;

	@include scrollbar-mixins.scroll-bar;
	@include scrollbar-mixins.scroll-mask(bottom, var(--spacing--lg));

	/* A scrolling column must not squeeze the form to fit. */
	> * {
		flex-shrink: 0;
	}
}

/* The dialog is a sibling of the trigger. The wrapper must not change the host layout. */
.root {
	display: contents;
}

.trigger {
	position: relative;
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
	height: var(--height--xl);
	padding: 0 var(--spacing--xs);
	border: var(--border);
	border-radius: var(--radius--2xs);
	background-color: var(--background--surface);

	&:hover:not([data-disabled]) {
		background-color: color-mix(in srgb, var(--background--surface) 90%, black 5%);
	}

	&:has(.open:focus-visible) {
		@include focus.focus-ring;
	}

	&[data-disabled] {
		opacity: 0.5;
	}
}

/* The button covers the row, so a click anywhere but the credential opens the dialog. */
.open {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	min-width: 0;
	padding: 0;
	border: none;
	background: none;
	color: inherit;
	font: inherit;
	cursor: pointer;

	&::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	&:focus-visible {
		outline: none;
	}

	&:disabled {
		cursor: not-allowed;
	}
}

.selectedName {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* The credential is a field of its own under the model, labelled like the panel's fields. */
.credentialField {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--3xs);
	margin-top: var(--spacing--xs);
}

.fieldLabel {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
	user-select: none;
}

/* The same row as the model's, as a button that opens the menu. */
.credentialTrigger {
	width: 100%;
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;

	&:focus-visible {
		@include focus.focus-ring;
	}

	&:disabled {
		cursor: not-allowed;
	}
}

/* The menu is as wide as the field, like a select. */
.credentialMenu {
	min-width: var(--reka-dropdown-menu-trigger-width);
}

.arrow {
	flex-shrink: 0;
	margin-left: auto;
	color: var(--text-color--subtler);
}

.step {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
}

/* The same height as the step frame of the dialog, so the list scrolls inside it and the hint stays below. */
.modelSteps {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	height: min(60dvh, calc(var(--height--5xl) * 5));
}

/* A model step takes the room above the hint. */
.fill,
.listStep {
	flex: 1;
	min-height: 0;
}

/* In line with the text of the rows above it. */
.moreHint {
	flex: none;
	margin: 0;
	padding: var(--spacing--2xs) var(--spacing--xs) 0;
}

/* An action inside the sentence. It reads as a link and works as a button. */
.moreHintAction {
	padding: 0;
	border: none;
	background: none;
	color: var(--text-color);
	font: inherit;
	text-decoration: underline;
	cursor: pointer;

	&:focus-visible {
		@include focus.focus-ring;
	}
}

/* The empty state fills the first page, centred like the other empty pages. */
.emptyState {
	flex: 1;
	justify-content: center;
	padding: var(--spacing--xl) 0;
}

/* A subtle divider sets the full list apart from the suggestions. The step gap is the space above it. */
.allModelsRow {
	padding-top: var(--spacing--2xs);
	border-top: var(--border-width) var(--border-style) var(--border-color--subtle);
}

/*
 * The way into the full list is as quiet as the column titles above it, and comes up to
 * the full text colour on hover and on focus, as the titles that sort do.
 */
.allModels {
	--button--color: var(--text-color--subtler);

	justify-content: space-between;
	width: 100%;

	&:hover:not(:disabled),
	&:focus-visible {
		--button--color: var(--text-color);
	}
}

.toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--spacing--2xs);
}

.search {
	flex: 1;
	min-width: var(--spacing--4xl);
}

.scroll {
	flex: 1;
	min-height: 0;
}

/*
 * Every list of the picker that scrolls fades out at its bottom edge, the design system's
 * hint that it goes on. The space under the last row keeps its text clear of the fade at
 * the end of the list.
 */
.fill,
.scroll {
	/* Positioned, so the hidden labels of the rows scroll with the list and add no height to the page. */
	position: relative;
	padding-bottom: var(--spacing--sm);
	overflow-y: auto;

	@include scrollbar-mixins.scroll-bar;
	@include scrollbar-mixins.scroll-mask(bottom, var(--spacing--lg));
}

.passive {
	pointer-events: none;
}
</style>
