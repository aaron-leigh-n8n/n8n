import type { BaseTextKey } from '@n8n/i18n';

import {
	AGENT_MODEL_PROVIDER_DEFINITIONS,
	isAgentModelProvider,
	type AgentModelProvider,
} from '../../model-providers';
import type { ModelPickerModel } from './modelPicker.utils';

/**
 * ponytail: prototype-only experiment, switched by "Preview models before
 * connecting" in the scenario menu. Before a credential exists, the catalogue
 * can still say what a provider offers, like the "Models" list of the shipped
 * selector. With nothing connected, the picker opens on the provider list. It
 * goes from a provider to its models, never from a model to its providers, and
 * nothing in it can be selected. Every provider gets the same table and the same
 * words, whether it is a lab's own API, a gateway, or a cloud.
 *
 * To remove the experiment: delete this file, ModelPickerProviderPreview.vue and
 * ModelPickerProviderLine.vue, then the lines marked "preview experiment" in
 * AgentModelPicker.vue, modelPickerScenarios.ts and ModelPickerScenarioSwitch.vue.
 */

export interface ProviderPreview {
	/** Current text models the provider serves, in the catalogue's order. Empty when the catalogue has none. */
	models: ModelPickerModel[];
	/** The labs that make them, in the same order. */
	labs: string[];
	/**
	 * Every model the provider serves, as the picker lists them once it is connected:
	 * the current text models first, then older snapshots and the other kinds of model.
	 */
	all: ModelPickerModel[];
}

/** Labs whose name differs from the provider that sells them, or that are not a provider. */
const LAB_NAMES: Record<string, string> = {
	alibaba: 'Alibaba',
	amazon: 'Amazon',
	meta: 'Meta',
	microsoft: 'Microsoft',
	zai: 'Z.ai',
};

/** Names and models a row shows before "and more". */
const LINE_NAMES = 3;

export function labName(lab: string): string {
	if (LAB_NAMES[lab]) return LAB_NAMES[lab];
	if (isAgentModelProvider(lab)) return AGENT_MODEL_PROVIDER_DEFINITIONS[lab].displayName;
	return lab.charAt(0).toUpperCase() + lab.slice(1);
}

export function getProviderPreview(
	catalog: ModelPickerModel[],
	provider: AgentModelProvider,
): ProviderPreview {
	const served = catalog.filter((model) => model.providers.includes(provider));
	const models = served.filter((model) => model.textOutput && !model.variant);
	const labs = [...new Set(models.map((model) => model.lab))];
	const all = [...models, ...served.filter((model) => !models.includes(model))];
	return { models, labs, all };
}

/** The line under a provider's name: the names it shows, and the sentence around them. */
export interface ProviderPreviewLine {
	/** The sentence the names sit in. Null when the names stand alone. */
	keypath: BaseTextKey | null;
	names: string;
}

/**
 * One line for the provider's row: its top models, or the labs it carries. A longer list
 * ends in "and more", with no count: the count of a catalogue reads as a promise of access.
 */
export function providerPreviewLine(preview: ProviderPreview): ProviderPreviewLine {
	if (preview.models.length === 0) {
		return { keypath: 'agents.modelPicker.preview.line.none', names: '' };
	}

	const ofLabs = preview.labs.length > 1;
	const all = ofLabs ? preview.labs.map(labName) : preview.models.map((model) => model.name);
	const names = all.slice(0, LINE_NAMES).join(', ');
	const more = (ofLabs ? all.length : preview.all.length) > LINE_NAMES;

	if (ofLabs) {
		return {
			keypath: more
				? 'agents.modelPicker.preview.line.labsMore'
				: 'agents.modelPicker.preview.line.labs',
			names,
		};
	}
	return { keypath: more ? 'agents.modelPicker.preview.line.modelsMore' : null, names };
}
