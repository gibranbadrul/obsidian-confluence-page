import { Base64 } from 'js-base64';

export function encodeBase64Utf8(input: string): string {
    return Base64.encode(input);
}
