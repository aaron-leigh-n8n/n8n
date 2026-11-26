import { isRecord } from '@n8n/utils/is-record';
import { jsonParse } from 'n8n-workflow';

/** Why the AI Gateway refused a request for a reason of the account's plan. */
export type GatewayRejectionType =
	| 'premium_model_locked'
	| 'request_cost_limit_exceeded'
	// The plan releases credits in steps, and not enough are released for this request.
	| 'credits_not_released';

export interface GatewayRejection {
	type: GatewayRejectionType;
	/** The gateway's own explanation. It includes the amounts for a cost limit rejection. */
	message?: string;
	/** The estimated cost in USD of a request over the cost limit. */
	estimatedCost?: number;
	/** The cost limit in USD for one request. */
	limit?: number;
}

const REJECTION_TYPES: readonly string[] = [
	'premium_model_locked',
	'request_cost_limit_exceeded',
	'credits_not_released',
] satisfies GatewayRejectionType[];

function isRejectionType(value: unknown): value is GatewayRejectionType {
	return typeof value === 'string' && REJECTION_TYPES.includes(value);
}

/** Reads the reason from a gateway response body: `{ error: { type, message } }`. */
function fromResponseBody(body: unknown): GatewayRejection | undefined {
	if (!isRecord(body) || !isRecord(body.error)) return undefined;
	const { type, message, estimatedCost, limit } = body.error;
	if (!isRejectionType(type)) return undefined;
	return {
		type,
		...(typeof message === 'string' ? { message } : {}),
		...(typeof estimatedCost === 'number' ? { estimatedCost } : {}),
		...(typeof limit === 'number' ? { limit } : {}),
	};
}

/** Reads the reason from a raw message such as `403 - {"error":{...}}`. */
function fromRawMessage(message: unknown): GatewayRejection | undefined {
	if (typeof message !== 'string') return undefined;
	const start = message.indexOf('{');
	if (start === -1) return undefined;
	return fromResponseBody(jsonParse<unknown>(message.slice(start), { fallbackValue: undefined }));
}

/**
 * Reads a plan rejection from a node error. Nodes keep the gateway's response body in one
 * of two places: as an object in `context.data`, or as text in `messages`.
 */
export function getGatewayRejection(error: unknown): GatewayRejection | undefined {
	if (!isRecord(error)) return undefined;

	if (isRecord(error.context)) {
		const rejection = fromResponseBody(error.context.data);
		if (rejection) return rejection;
	}

	if (!Array.isArray(error.messages)) return undefined;
	for (const message of error.messages) {
		const rejection = fromRawMessage(message);
		if (rejection) return rejection;
	}
	return undefined;
}
