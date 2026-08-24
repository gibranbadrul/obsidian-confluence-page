export type JsonRecord = Record<string, unknown>;

export function isJsonRecord(value: unknown): value is JsonRecord {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function readOptionalString(record: JsonRecord, key: string): string | undefined {
	const value = record[key];
	return typeof value === 'string' ? value : undefined;
}

export function readOptionalNumber(record: JsonRecord | undefined, key: string): number | undefined {
	if (!record) return undefined;
	const value = record[key];
	return typeof value === 'number' ? value : undefined;
}

export function readOptionalObject(record: JsonRecord, key: string): JsonRecord | undefined {
	const value = record[key];
	return isJsonRecord(value) ? value : undefined;
}

export function readRecordArray(record: JsonRecord, key: string): JsonRecord[] {
	const value = record[key];
	if (!Array.isArray(value)) return [];
	return value.filter(isJsonRecord);
}
