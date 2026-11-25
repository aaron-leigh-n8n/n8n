// Prototype only. The tools the assistant currently offers under its question.
// The state is shared, because a chip removed in the composer returns to the offer.
import { ref } from 'vue';

export const offeredCapabilityIds = ref<string[]>([]);
export const isOfferOpen = ref(false);

export function openOffer(ids: string[]): void {
	offeredCapabilityIds.value = ids;
	isOfferOpen.value = true;
}

export function closeOffer(): void {
	offeredCapabilityIds.value = [];
	isOfferOpen.value = false;
}

/** Takes a capability out of the offer when it moves into the composer. */
export function takeCapability(id: string): void {
	offeredCapabilityIds.value = offeredCapabilityIds.value.filter((offered) => offered !== id);
}

/** Puts a capability back in the offer, so the user can add it again. */
export function returnCapability(id: string): void {
	if (!isOfferOpen.value || offeredCapabilityIds.value.includes(id)) return;
	offeredCapabilityIds.value = [...offeredCapabilityIds.value, id];
}
