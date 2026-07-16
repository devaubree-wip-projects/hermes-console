import contract from "../gatewaycontracts/gateway.json";

export const GATEWAY_PROTOCOL_VERSION = contract.protocolVersion;
export const GATEWAY_PATHS = Object.freeze(contract.paths);
export const GATEWAY_SERVICE_HEADERS = Object.freeze(contract.serviceHeaders);
export const GATEWAY_WORK_PROTOCOL_VERSION = contract.work.protocolVersion;
export const GATEWAY_WORK_PATHS = Object.freeze(contract.work.paths);

export type GatewayPathName = keyof typeof GATEWAY_PATHS;
export type GatewayServiceHeaderName = keyof typeof GATEWAY_SERVICE_HEADERS;
