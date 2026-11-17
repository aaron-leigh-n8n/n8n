import type { PolicyAction } from '@n8n/api-types';
import { shallowReactive } from 'vue';

import { usePolicyAdminAccess } from '../../composables/usePolicyAdminAccess';
import type { RestrictedTypeKind } from '../../type-availability-policies.constants';
import { useInstancePolicy } from '../useInstancePolicy';

/** Reads and changes the access of single types for the access dialogs. */
export function useTypeAccessEdits() {
	const { manageableKinds } = usePolicyAdminAccess();
	const instancePolicy = useInstancePolicy();

	// Shows the chosen access while its save runs. The store holds the access that the server read.
	// Each change gets its own token, so an earlier save that ends does not clear a later choice.
	const pending = shallowReactive(new Map<string, { action: PolicyAction; token: symbol }>());
	const keyOf = (kind: RestrictedTypeKind, name: string) => `${kind}:${name}`;

	function accessOf(kind: RestrictedTypeKind, name: string): PolicyAction | undefined {
		return (
			pending.get(keyOf(kind, name))?.action ?? instancePolicy.typeAccess[kind]?.byName.get(name)
		);
	}

	const isLocked = (kind: RestrictedTypeKind, name: string) =>
		instancePolicy.typeAccess[kind]?.locked.has(name) ?? false;

	const canManage = (kind: RestrictedTypeKind) => manageableKinds.value.includes(kind);

	async function setAccess(kind: RestrictedTypeKind, name: string, action: PolicyAction) {
		const key = keyOf(kind, name);
		const token = Symbol(key);
		pending.set(key, { action, token });
		try {
			await instancePolicy.setAccess(kind, name, action);
		} finally {
			if (pending.get(key)?.token === token) pending.delete(key);
		}
	}

	return { accessOf, isLocked, canManage, setAccess };
}
