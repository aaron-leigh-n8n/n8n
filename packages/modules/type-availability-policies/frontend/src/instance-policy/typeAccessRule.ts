import type { InstanceTypeAccessResponse, PolicyAction, PolicySelector } from '@n8n/api-types';
import { generateNanoId } from '@n8n/utils/generate-nano-id';

import type { InstancePolicyContent } from '../type-availability-policies.api';
import type { RestrictedTypeKind } from '../type-availability-policies.constants';

type Rule = { selector: PolicySelector };

/**
 * False when a rule leaves the type open to project opt-in. The admin page sets only Allowed and
 * Restricted, so it cannot change such a type without removing what that rule decides.
 */
export function isTypeAccessEditable({
	access,
	matchedRuleId,
}: InstanceTypeAccessResponse['types'][number]): boolean {
	return !(access === 'delegate' && matchedRuleId !== null);
}

const isNameRule = (rule: Rule, name: string) =>
	rule.selector.kind === 'name' && rule.selector.value === name;

/** How the server matches a node type: a `name` rule also matches the Tool variants of its base. */
function matchesNodeType(rule: Rule, nodeType: string, baseName: string): boolean {
	const { kind, value } = rule.selector;
	if (kind === 'name') return value === nodeType || value === baseName;
	if (kind === 'package') return value === nodeType.split('.')[0];
	return false;
}

/** The `name` rules of the Tool variants of `nodeType` that decide now: no earlier rule matches the variant. */
function decidingVariantRules<R extends Rule>(rules: readonly R[], nodeType: string): R[] {
	return [`${nodeType}Tool`, `${nodeType}HitlTool`].flatMap((variant) => {
		const deciding = rules.find((rule) => matchesNodeType(rule, variant, nodeType));
		return deciding && isNameRule(deciding, variant) ? [deciding] : [];
	});
}

/**
 * Sets the access of one type with a `name` rule at the top of the policy. The first matching rule
 * decides, so the new rule wins over package and `extends` rules, and it replaces the earlier
 * `name` rules of the type.
 *
 * A `name` rule on a node type also matches its Tool variants. A variant rule that decides now
 * stays above the new rule, so the change does not alter what the variant gets.
 */
export function withTypeAccess<K extends RestrictedTypeKind>(
	kind: K,
	policy: InstancePolicyContent<K>,
	typeName: string,
	action: PolicyAction,
): InstancePolicyContent<K> {
	const { rules } = policy;
	const deciding = kind === 'node' ? decidingVariantRules(rules, typeName) : [];
	const kept = rules.filter((rule) => deciding.includes(rule));
	const others = rules.filter((rule) => !isNameRule(rule, typeName) && !kept.includes(rule));
	const rule = {
		id: generateNanoId(),
		action,
		selector: { kind: 'name', value: typeName },
	} as const;

	return { rules: [...kept, rule, ...others], defaultAction: policy.defaultAction };
}
