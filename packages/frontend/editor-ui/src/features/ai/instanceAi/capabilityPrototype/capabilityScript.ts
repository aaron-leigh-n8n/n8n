// Prototype only. A fixed script that plays the "give this workflow more tools" flow
// through the real Assistant thread runtime. Nothing here talks to the backend.
import type { InstanceAiAttachment, InstanceAiEvent } from '@n8n/api-types';
import type { IconName } from '@n8n/design-system';
import { sleep } from '@n8n/utils/sleep';
import type { INodeTypeDescription, IRunData, ITaskData } from 'n8n-workflow';

import type { WorkflowDraft } from '../instanceAi.workflowDrafts';

export interface Capability {
	id: string;
	name: string;
	icon: IconName;
	nodeType: string;
	typeVersion: number;
}

export const CAPABILITIES: Capability[] = [
	{
		id: 'capability:web-reader',
		name: 'Web Reader',
		icon: 'globe',
		nodeType: 'n8n-prototype.webReader',
		typeVersion: 1,
	},
	{
		id: 'capability:web-search',
		name: 'Web Search',
		icon: 'search',
		nodeType: 'n8n-prototype.webSearch',
		typeVersion: 1,
	},
	{
		id: 'capability:writer',
		name: 'Writer',
		icon: 'pen',
		nodeType: 'n8n-prototype.writer',
		typeVersion: 1,
	},
];

export const GATEWAY_CREDITS_LABEL = 'Gateway credits';

/**
 * Stand-in node types for the capabilities, so each one has its own icon on the
 * canvas. The prototype view adds them to the node types store while it is open.
 */
export const CAPABILITY_NODE_TYPES: INodeTypeDescription[] = CAPABILITIES.map((capability) => ({
	displayName: capability.name,
	name: capability.nodeType,
	group: ['transform'],
	version: capability.typeVersion,
	description: `${capability.name} tool, paid with ${GATEWAY_CREDITS_LABEL}`,
	icon: `fa:${capability.icon}`,
	defaults: { name: capability.name },
	inputs: [],
	outputs: ['ai_tool'],
	outputNames: ['Tool'],
	// The canvas shows this subtitle as a chip. See `CanvasNodeDefault.vue`.
	subtitle: GATEWAY_CREDITS_LABEL,
	properties: [],
}));

export const CHAT_MODEL_NODE_TYPE = 'n8n-prototype.chatModel';
const REAL_CHAT_MODEL_NODE_TYPE = '@n8n/n8n-nodes-langchain.lmChatAnthropic';

/**
 * A stand-in chat model that Gateway credits pay for. It copies the real chat
 * model node, so it keeps the icon, and it falls back to a plain one before the
 * node types load.
 */
export function createChatModelNodeType(
	getNodeType: (name: string) => INodeTypeDescription | null,
): INodeTypeDescription {
	const real = getNodeType(REAL_CHAT_MODEL_NODE_TYPE);
	return {
		...(real ?? {
			displayName: 'Chat model',
			group: ['transform'],
			description: 'Chat model',
			icon: 'fa:robot',
			defaults: { name: 'Chat model' },
			inputs: [],
			outputs: ['ai_languageModel'],
			outputNames: ['Model'],
		}),
		name: CHAT_MODEL_NODE_TYPE,
		version: 1,
		defaultVersion: 1,
		subtitle: GATEWAY_CREDITS_LABEL,
		properties: [],
		credentials: [],
	};
}

export const OPENING_PROMPT =
	'When someone fills in my contact form, add them to a sheet and tell me in Slack.';

const FILE_PATH = 'contact-form-to-slack.workflow.ts';
const WORKFLOW_NAME = 'Contact form to Sheets and Slack';
const ROOT_AGENT = 'agent-001';

const FORM = 'Contact form';
const SHEET = 'Add to sheet';
const SLACK = 'Tell me in Slack';
const AGENT = 'Research contact';
const MODEL = 'Chat model';

type DraftNode = WorkflowDraft['workflow']['nodes'][number];

function node(
	name: string,
	type: string,
	typeVersion: number,
	position: [number, number],
	parameters: Record<string, unknown> = {},
): DraftNode {
	return { id: name, name, type, typeVersion, position, parameters };
}

const main = (target: string) => ({ main: [[{ node: target, type: 'main', index: 0 }]] });

function baseDraft(): WorkflowDraft {
	return {
		filePath: FILE_PATH,
		revision: 1,
		workflow: {
			name: WORKFLOW_NAME,
			nodes: [
				node(FORM, 'n8n-nodes-base.formTrigger', 2.2, [0, 0], { formTitle: 'Contact us' }),
				node(SHEET, 'n8n-nodes-base.googleSheets', 4.5, [224, 0], {
					resource: 'sheet',
					operation: 'append',
				}),
				node(SLACK, 'n8n-nodes-base.slack', 2.3, [448, 0], {
					resource: 'message',
					operation: 'post',
				}),
			],
			connections: { [FORM]: main(SHEET), [SHEET]: main(SLACK) },
		},
	};
}

function draftWithCapabilities(capabilities: Capability[]): WorkflowDraft {
	const toolNodes = capabilities.map((capability, index) =>
		node(capability.name, capability.nodeType, capability.typeVersion, [608 + index * 176, 224]),
	);
	return {
		filePath: FILE_PATH,
		revision: 2,
		workflow: {
			name: WORKFLOW_NAME,
			nodes: [
				node(FORM, 'n8n-nodes-base.formTrigger', 2.2, [0, 0], { formTitle: 'Contact us' }),
				node(SHEET, 'n8n-nodes-base.googleSheets', 4.5, [224, 0], {
					resource: 'sheet',
					operation: 'append',
				}),
				node(AGENT, '@n8n/n8n-nodes-langchain.agent', 2, [448, 0]),
				node(MODEL, CHAT_MODEL_NODE_TYPE, 1, [432, 224]),
				...toolNodes,
				node(SLACK, 'n8n-nodes-base.slack', 2.3, [800, 0], {
					resource: 'message',
					operation: 'post',
				}),
			],
			connections: {
				[FORM]: main(SHEET),
				[SHEET]: main(AGENT),
				[AGENT]: main(SLACK),
				[MODEL]: { ai_languageModel: [[{ node: AGENT, type: 'ai_languageModel', index: 0 }]] },
				...Object.fromEntries(
					capabilities.map((capability) => [
						capability.name,
						{ ai_tool: [[{ node: AGENT, type: 'ai_tool', index: 0 }]] },
					]),
				),
			},
		},
	};
}

function task(json: Record<string, unknown>, output = 'main'): ITaskData {
	return {
		startTime: Date.now(),
		executionIndex: 0,
		executionTime: 120,
		executionStatus: 'success',
		source: [],
		data: { [output]: [[{ json }]] },
	};
}

const CONTACT = {
	name: 'Maya Chen',
	email: 'maya@northwind.io',
	message: 'We would like a demo for our support team.',
};

/** What the canvas host does for the script. */
export interface ScriptHost {
	showDraft: (draft: WorkflowDraft) => void;
	setBuilding: (building: boolean) => void;
	/** Marks nodes as run, one step at a time. */
	showRunStep: (runData: IRunData, finished: boolean) => void;
	clearRun: () => void;
	offerCapabilities: () => void;
}

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

function createTurn(applyEvent: (event: InstanceAiEvent) => void) {
	const runId = nextId('proto-run');
	const emit = (type: string, payload: Record<string, unknown>) =>
		// The script builds events by hand, so the union type is asserted here.
		applyEvent({ type, runId, agentId: ROOT_AGENT, payload } as InstanceAiEvent);

	return {
		start: () => emit('run-start', { messageId: nextId('proto-msg'), messageGroupId: runId }),
		finish: () => emit('run-finish', { status: 'completed' }),
		async say(text: string) {
			for (const word of text.split(/(?<=\s)/)) {
				emit('text-delta', { text: word });
				await sleep(28);
			}
		},
		async tool(toolName: string, args: Record<string, unknown>, work: () => Promise<unknown>) {
			const toolCallId = nextId('proto-tool');
			emit('tool-call', { toolCallId, toolName, args });
			const result = await work();
			emit('tool-result', { toolCallId, result });
		},
	};
}

async function run(host: ScriptHost, steps: Array<[string, ITaskData]>) {
	host.clearRun();
	const runData: IRunData = {};
	for (const [index, [name, data]] of steps.entries()) {
		await sleep(520);
		runData[name] = [data];
		host.showRunStep({ ...runData }, index === steps.length - 1);
	}
	await sleep(300);
	return { executionId: nextId('proto-exec'), status: 'success' };
}

async function playFirstBuild(applyEvent: (event: InstanceAiEvent) => void, host: ScriptHost) {
	const turn = createTurn(applyEvent);
	turn.start();
	await sleep(700);
	await turn.say(
		"I'll build this in three steps: a form trigger for your contact form, a Google Sheets step that adds a row, and a Slack message to you.",
	);
	await turn.tool('workflow_builder_build_workflow', { name: WORKFLOW_NAME }, async () => {
		host.setBuilding(true);
		await sleep(600);
		host.showDraft(baseDraft());
		await sleep(2600);
		host.setBuilding(false);
		return { success: true };
	});
	await turn.tool('run_workflow', { workflowName: WORKFLOW_NAME }, async () => {
		const slackText = `New contact form entry from ${CONTACT.name} (${CONTACT.email}): "${CONTACT.message}"`;
		return await run(host, [
			[FORM, task(CONTACT)],
			[SHEET, task({ ...CONTACT, row: 14 })],
			[SLACK, task({ ok: true, channel: '@you', text: slackText })],
		]);
	});
	await turn.say(
		[
			'The workflow is ready, and a test run with a sample entry worked. The row is in your sheet, and this is the message you got in Slack:',
			'',
			'> **New contact form entry**',
			`> ${CONTACT.name} (${CONTACT.email}): "${CONTACT.message}"`,
			'',
			`Do you want to give this workflow more tools? Your included ${GATEWAY_CREDITS_LABEL} cover them, so you have no accounts or API keys to set up.`,
		].join('\n'),
	);
	turn.finish();
	host.offerCapabilities();
}

function betterSlackMessage(capabilities: Capability[]): string[] {
	const has = (id: string) => capabilities.some((capability) => capability.id === id);
	const lines = [`> **New lead: ${CONTACT.name}, Head of Support at Northwind Logistics**`];
	if (has('capability:web-reader')) {
		lines.push(
			'> **Company:** Northwind makes freight tracking software for mid-size carriers. About 250 people. *(read from northwind.io)*',
		);
	}
	if (has('capability:web-search')) {
		lines.push(
			'> **In the news:** Opened three EU hubs in October and is hiring 40 support agents. *(2 sources)*',
		);
	}
	lines.push(`> **They asked:** "${CONTACT.message}"`);
	if (has('capability:writer')) {
		lines.push(
			'> **Suggested reply:** "Hi Maya, thanks for reaching out. With your support team growing across the new EU hubs, a 30-minute demo this week could show how we cut first-response time. Does Thursday work?"',
		);
	}
	return lines;
}

function listNames(capabilities: Capability[]): string {
	const names = capabilities.map((capability) => capability.name);
	if (names.length <= 1) return names.join('');
	return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

async function playAddCapabilities(
	applyEvent: (event: InstanceAiEvent) => void,
	host: ScriptHost,
	capabilities: Capability[],
) {
	const turn = createTurn(applyEvent);
	const names = listNames(capabilities);
	turn.start();
	await sleep(700);
	await turn.say(
		`I'll add ${names}. An AI Agent step will use ${capabilities.length > 1 ? 'them' : 'it'} to look into each contact before the Slack message goes out. Your included ${GATEWAY_CREDITS_LABEL} cover the model and the ${capabilities.length > 1 ? 'tools' : 'tool'}.`,
	);
	await turn.tool('workflow_builder_build_workflow', { name: WORKFLOW_NAME }, async () => {
		host.clearRun();
		host.setBuilding(true);
		await sleep(600);
		host.showDraft(draftWithCapabilities(capabilities));
		await sleep(2800);
		host.setBuilding(false);
		return { success: true };
	});
	await turn.tool('run_workflow', { workflowName: WORKFLOW_NAME }, async () => {
		return await run(host, [
			[FORM, task(CONTACT)],
			[SHEET, task({ ...CONTACT, row: 15 })],
			[MODEL, task({ response: 'ok' }, 'ai_languageModel')],
			...capabilities.map((capability): [string, ITaskData] => [
				capability.name,
				task({ response: 'ok' }, 'ai_tool'),
			]),
			[AGENT, task({ output: betterSlackMessage(capabilities).join('\n') })],
			[SLACK, task({ ok: true, channel: '@you' })],
		]);
	});
	await turn.say(
		[
			`Done. The workflow now uses ${names}, and I ran it again with the same entry. This is the new Slack message:`,
			'',
			...betterSlackMessage(capabilities),
			'',
			`Each new contact now arrives with this context, so you can reply at once. This run used your included ${GATEWAY_CREDITS_LABEL}. The nodes they pay for have a ${GATEWAY_CREDITS_LABEL} label on the canvas.`,
		].join('\n'),
	);
	turn.finish();
}

async function playFallback(applyEvent: (event: InstanceAiEvent) => void) {
	const turn = createTurn(applyEvent);
	turn.start();
	await sleep(500);
	await turn.say('This prototype follows one script. Pick one or more tools above, then send.');
	turn.finish();
}

function selectedCapabilities(attachments: InstanceAiAttachment[] | undefined, message: string) {
	const text = message.toLowerCase();
	return CAPABILITIES.filter(
		(capability) =>
			attachments?.some(
				(attachment) => attachment.type === 'agent' && attachment.id === capability.id,
			) ?? text.includes(capability.name.toLowerCase()),
	);
}

/** The responder of the prototype thread. The first message builds, the next adds tools. */
export function createCapabilityResponder(host: ScriptHost) {
	let built = false;
	return ({
		message,
		attachments,
		applyEvent,
	}: {
		message: string;
		attachments?: InstanceAiAttachment[];
		applyEvent: (event: InstanceAiEvent) => void;
	}) => {
		if (!built) {
			built = true;
			void playFirstBuild(applyEvent, host);
			return;
		}
		const capabilities = selectedCapabilities(attachments, message);
		if (capabilities.length === 0) {
			void playFallback(applyEvent);
			return;
		}
		void playAddCapabilities(applyEvent, host, capabilities);
	};
}
