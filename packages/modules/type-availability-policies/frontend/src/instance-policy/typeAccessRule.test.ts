import type { InstancePolicy } from '../type-availability-policies.api';
import { withTypeAccess } from './typeAccessRule';

function policy(rules: InstancePolicy<'node'>['rules']): InstancePolicy<'node'> {
	return { rules, defaultAction: 'allow', version: 3 } as InstancePolicy<'node'>;
}

const DENY_PACKAGE = {
	id: 'deny-langchain',
	action: 'deny',
	selector: { kind: 'package', value: '@n8n/n8n-nodes-langchain' },
} as const;

describe('withTypeAccess', () => {
	it('puts a name rule for the type first, so it wins over a package rule', () => {
		const result = withTypeAccess(
			'node',
			policy([DENY_PACKAGE]),
			'@n8n/n8n-nodes-langchain.agent',
			'allow',
		);

		expect(result.rules).toEqual([
			{
				id: expect.any(String),
				action: 'allow',
				selector: { kind: 'name', value: '@n8n/n8n-nodes-langchain.agent' },
			},
			DENY_PACKAGE,
		]);
		expect(result.defaultAction).toBe('allow');
	});

	it('replaces the earlier name rules of the type and keeps the rules of other types', () => {
		const denySlack = {
			id: 'deny-slack',
			action: 'deny',
			selector: { kind: 'name', value: 'n8n-nodes-base.slack' },
		} as const;
		const denyNotion = {
			id: 'deny-notion',
			action: 'deny',
			selector: { kind: 'name', value: 'n8n-nodes-base.notion' },
		} as const;

		const result = withTypeAccess(
			'node',
			policy([denyNotion, denySlack]),
			'n8n-nodes-base.notion',
			'allow',
		);

		expect(result.rules).toHaveLength(2);
		expect(result.rules[0]).toMatchObject({
			action: 'allow',
			selector: { kind: 'name', value: 'n8n-nodes-base.notion' },
		});
		expect(result.rules[0].id).not.toBe('deny-notion');
		expect(result.rules[1]).toBe(denySlack);
	});

	it('keeps a variant rule that decided before the base rule above the new base rule', () => {
		const denySlackTool = {
			id: 'deny-slack-tool',
			action: 'deny',
			selector: { kind: 'name', value: 'n8n-nodes-base.slackTool' },
		} as const;
		const allowSlack = {
			id: 'allow-slack',
			action: 'allow',
			selector: { kind: 'name', value: 'n8n-nodes-base.slack' },
		} as const;

		const result = withTypeAccess(
			'node',
			policy([denySlackTool, allowSlack, DENY_PACKAGE]),
			'n8n-nodes-base.slack',
			'allow',
		);

		expect(result.rules.map(({ selector }) => selector.value)).toEqual([
			'n8n-nodes-base.slackTool',
			'n8n-nodes-base.slack',
			'@n8n/n8n-nodes-langchain',
		]);
	});

	it('leaves a variant rule that the old base rule shadowed below the new base rule', () => {
		const allowSlack = {
			id: 'allow-slack',
			action: 'allow',
			selector: { kind: 'name', value: 'n8n-nodes-base.slack' },
		} as const;
		const denySlackHitlTool = {
			id: 'deny-slack-hitl-tool',
			action: 'deny',
			selector: { kind: 'name', value: 'n8n-nodes-base.slackHitlTool' },
		} as const;

		const result = withTypeAccess(
			'node',
			policy([allowSlack, denySlackHitlTool]),
			'n8n-nodes-base.slack',
			'deny',
		);

		expect(result.rules.map(({ selector }) => selector.value)).toEqual([
			'n8n-nodes-base.slack',
			'n8n-nodes-base.slackHitlTool',
		]);
	});

	it('leaves a variant rule that a package rule shadows below the new base rule', () => {
		const denyBasePackage = {
			id: 'deny-base',
			action: 'deny',
			selector: { kind: 'package', value: 'n8n-nodes-base' },
		} as const;
		const allowSlackTool = {
			id: 'allow-slack-tool',
			action: 'allow',
			selector: { kind: 'name', value: 'n8n-nodes-base.slackTool' },
		} as const;

		const result = withTypeAccess(
			'node',
			policy([denyBasePackage, allowSlackTool]),
			'n8n-nodes-base.slack',
			'deny',
		);

		expect(result.rules.map(({ selector }) => selector.value)).toEqual([
			'n8n-nodes-base.slack',
			'n8n-nodes-base',
			'n8n-nodes-base.slackTool',
		]);
	});

	it('moves no rule for a credential type whose name ends in Tool', () => {
		const denyFooTool = {
			id: 'deny-foo-tool',
			action: 'deny',
			selector: { kind: 'name', value: 'fooApiTool' },
		} as const;

		const result = withTypeAccess(
			'credential',
			policy([denyFooTool]) as unknown as InstancePolicy<'credential'>,
			'fooApi',
			'allow',
		);

		expect(result.rules.map(({ selector }) => selector.value)).toEqual(['fooApi', 'fooApiTool']);
	});

	it('keeps both deciding variant rules above the new base rule, in their order', () => {
		const denySlackHitlTool = {
			id: 'deny-slack-hitl-tool',
			action: 'deny',
			selector: { kind: 'name', value: 'n8n-nodes-base.slackHitlTool' },
		} as const;
		const allowSlackTool = {
			id: 'allow-slack-tool',
			action: 'allow',
			selector: { kind: 'name', value: 'n8n-nodes-base.slackTool' },
		} as const;

		const result = withTypeAccess(
			'node',
			policy([denySlackHitlTool, allowSlackTool]),
			'n8n-nodes-base.slack',
			'deny',
		);

		expect(result.rules.map(({ selector }) => selector.value)).toEqual([
			'n8n-nodes-base.slackHitlTool',
			'n8n-nodes-base.slackTool',
			'n8n-nodes-base.slack',
		]);
	});

	it('keeps only the variant rule that decides when a package rule shadows the other one', () => {
		const denySlackHitlTool = {
			id: 'deny-slack-hitl-tool',
			action: 'deny',
			selector: { kind: 'name', value: 'n8n-nodes-base.slackHitlTool' },
		} as const;
		const denyBasePackage = {
			id: 'deny-base',
			action: 'deny',
			selector: { kind: 'package', value: 'n8n-nodes-base' },
		} as const;
		const allowSlackTool = {
			id: 'allow-slack-tool',
			action: 'allow',
			selector: { kind: 'name', value: 'n8n-nodes-base.slackTool' },
		} as const;

		const result = withTypeAccess(
			'node',
			policy([denySlackHitlTool, denyBasePackage, allowSlackTool]),
			'n8n-nodes-base.slack',
			'allow',
		);

		expect(result.rules.map(({ selector }) => selector.value)).toEqual([
			'n8n-nodes-base.slackHitlTool',
			'n8n-nodes-base.slack',
			'n8n-nodes-base',
			'n8n-nodes-base.slackTool',
		]);
	});
});
