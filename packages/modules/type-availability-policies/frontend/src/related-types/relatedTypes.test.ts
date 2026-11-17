import type { INodeCredentialDescription, INodeTypeDescription } from 'n8n-workflow';

import {
	buildCredentialTypeIndex,
	getGeneratedToolVariantBase,
	getRelatedTypes,
} from './relatedTypes';

function nodeType(
	name: string,
	credentials: string[] = [],
	extra: Partial<INodeTypeDescription> = {},
): INodeTypeDescription {
	return {
		displayName: name,
		name,
		group: ['transform'],
		version: 1,
		description: '',
		defaults: {},
		inputs: [],
		outputs: [],
		properties: [],
		credentials: credentials.map(
			(credential): INodeCredentialDescription => ({ name: credential }),
		),
		...extra,
	};
}

function relatedTo(name: string, descriptions: INodeTypeDescription[]) {
	return getRelatedTypes(name, buildCredentialTypeIndex(descriptions));
}

describe('getGeneratedToolVariantBase', () => {
	const types = new Map<string, Partial<INodeTypeDescription>>([
		['n8n-nodes-base.gmail', { usableAsTool: true }],
		['n8n-nodes-base.slack', {}],
		['@n8n/n8n-nodes-langchain.agent', {}],
	]);
	const getNodeType = (name: string) => types.get(name);

	it('detects a Tool variant of a node type usable as a tool', () => {
		expect(getGeneratedToolVariantBase('n8n-nodes-base.gmailTool', getNodeType)).toBe(
			'n8n-nodes-base.gmail',
		);
	});

	it('detects a HitlTool variant, whose base does not need to be usable as a tool', () => {
		expect(getGeneratedToolVariantBase('n8n-nodes-base.slackHitlTool', getNodeType)).toBe(
			'n8n-nodes-base.slack',
		);
	});

	it('keeps real node types whose name ends in Tool', () => {
		expect(
			getGeneratedToolVariantBase('@n8n/n8n-nodes-langchain.agentTool', getNodeType),
		).toBeUndefined();
		expect(
			getGeneratedToolVariantBase('@n8n/n8n-nodes-langchain.mcpClientTool', getNodeType),
		).toBeUndefined();
	});

	it('keeps node types that do not end in Tool', () => {
		expect(getGeneratedToolVariantBase('n8n-nodes-base.gmail', getNodeType)).toBeUndefined();
	});
});

describe('buildCredentialTypeIndex', () => {
	it('links every node type that lists a credential type, in every version, with no filter', () => {
		const index = buildCredentialTypeIndex([
			nodeType('n8n-nodes-base.gmail', ['googleApi', 'httpHeaderAuth']),
			nodeType('n8n-nodes-base.googleDrive', ['googleApi'], { version: 1 }),
			nodeType('n8n-nodes-base.googleDrive', [], { version: 2 }),
			nodeType('n8n-nodes-base.evaluation', ['googleApi']),
		]);

		expect(index.nodeTypesByCredentialType.get('googleApi')).toEqual(
			new Set(['n8n-nodes-base.gmail', 'n8n-nodes-base.googleDrive', 'n8n-nodes-base.evaluation']),
		);
		expect(index.nodeTypesByCredentialType.get('httpHeaderAuth')).toEqual(
			new Set(['n8n-nodes-base.gmail']),
		);
		expect(index.latestNodeTypes.get('n8n-nodes-base.googleDrive')?.version).toBe(2);
	});
});

describe('getRelatedTypes', () => {
	it('relates node types that share a credential type, and the trigger by name', () => {
		const descriptions = [
			nodeType('n8n-nodes-base.notion', ['notionApi', 'notionOAuth2Api', 'httpHeaderAuth']),
			nodeType('n8n-nodes-base.notionTrigger', ['notionApi']),
			nodeType('n8n-nodes-base.httpRequest', ['httpHeaderAuth']),
		];

		expect(relatedTo('n8n-nodes-base.notion', descriptions)).toEqual({
			nodeTypes: ['n8n-nodes-base.notionTrigger'],
			credentialTypes: ['notionApi', 'notionOAuth2Api'],
		});
	});

	it('shows shared credential types but relates no node type through them', () => {
		const descriptions = [
			nodeType('n8n-nodes-base.gmail', ['googleApi', 'gmailOAuth2']),
			nodeType('n8n-nodes-base.googleDrive', ['googleApi', 'googleDriveOAuth2Api']),
		];

		expect(relatedTo('n8n-nodes-base.gmail', descriptions)).toEqual({
			nodeTypes: [],
			credentialTypes: ['googleApi', 'gmailOAuth2'],
		});
	});

	it('relates a trigger and its node type by name when they list different credential types', () => {
		const descriptions = [
			nodeType('n8n-nodes-base.googleSheets', ['googleSheetsOAuth2Api']),
			nodeType('n8n-nodes-base.googleSheetsTrigger', ['googleSheetsTriggerOAuth2Api']),
		];

		expect(relatedTo('n8n-nodes-base.googleSheetsTrigger', descriptions).nodeTypes).toEqual([
			'n8n-nodes-base.googleSheets',
		]);
		expect(relatedTo('n8n-nodes-base.googleSheets', descriptions).nodeTypes).toEqual([
			'n8n-nodes-base.googleSheetsTrigger',
		]);
	});

	it('returns nothing for a node type with no credential type and no trigger', () => {
		expect(relatedTo('n8n-nodes-base.hackerNews', [nodeType('n8n-nodes-base.hackerNews')])).toEqual(
			{ nodeTypes: [], credentialTypes: [] },
		);
	});

	it('shows only the credential types the node type lists, also those of old versions', () => {
		const descriptions = [
			nodeType('n8n-nodes-base.slack', ['slackApi', 'slackOAuth2Api']),
			nodeType('n8n-nodes-base.slackTrigger', ['slackApi']),
			nodeType('n8n-nodes-base.calendly', ['calendlyApi'], { version: 1 }),
			nodeType('n8n-nodes-base.calendly', ['calendlyOAuth2Api'], { version: 2 }),
		];

		expect(relatedTo('n8n-nodes-base.slackTrigger', descriptions).credentialTypes).toEqual([
			'slackApi',
		]);
		expect(relatedTo('n8n-nodes-base.calendly', descriptions).credentialTypes).toEqual([
			'calendlyApi',
			'calendlyOAuth2Api',
		]);
	});

	it('does not relate node types through the credential types of the excluded node types', () => {
		const descriptions = [
			nodeType('@n8n/n8n-nodes-langchain.agent', ['postgres']),
			nodeType('n8n-nodes-base.postgres', ['postgres']),
		];

		expect(relatedTo('@n8n/n8n-nodes-langchain.agent', descriptions)).toEqual({
			nodeTypes: [],
			credentialTypes: ['postgres'],
		});
		expect(relatedTo('n8n-nodes-base.postgres', descriptions).nodeTypes).toEqual([]);
	});

	it('leaves out hidden node types and generated tool variants', () => {
		const descriptions = [
			nodeType('n8n-nodes-base.gmail', ['gmailOAuth2'], { usableAsTool: true }),
			nodeType('n8n-nodes-base.gmailTool', ['gmailOAuth2']),
			nodeType('n8n-nodes-base.gmailHitlTool', ['gmailOAuth2']),
			nodeType('n8n-nodes-base.gmailLegacy', ['gmailOAuth2'], { hidden: true }),
		];

		expect(relatedTo('n8n-nodes-base.gmail', descriptions).nodeTypes).toEqual([]);
	});

	it('does not follow a chain of related node types', () => {
		const descriptions = [
			nodeType('n8n-nodes-base.a', ['aApi']),
			nodeType('n8n-nodes-base.b', ['aApi', 'bApi']),
			nodeType('n8n-nodes-base.c', ['bApi']),
		];

		expect(relatedTo('n8n-nodes-base.a', descriptions).nodeTypes).toEqual(['n8n-nodes-base.b']);
	});
});
