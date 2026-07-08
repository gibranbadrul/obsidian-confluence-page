import { describe, expect, it } from 'vitest';
import { encodeBase64Utf8 } from '../../src/utils/base64';

describe('encodeBase64Utf8', () => {
    it('encodes Basic auth credentials', () => {
        expect(encodeBase64Utf8('user@example.com:token')).toBe('dXNlckBleGFtcGxlLmNvbTp0b2tlbg==');
    });

    it('encodes UTF-8 text', () => {
        expect(encodeBase64Utf8('mañana')).toBe('bWHDsWFuYQ==');
    });
});