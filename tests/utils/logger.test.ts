import { describe, expect, it, vi } from 'vitest';
import { Logger } from '../../src/utils/logger';

describe('Logger', () => {
	it('stores recent logs and formats them', () => {
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const logger = new Logger();

		logger.info('Published', 'note.md');

		expect(logger.getLogs()).toHaveLength(1);
		expect(logger.getRecentLogs(1)[0]).toMatchObject({ level: 'info', message: 'Published', details: 'note.md' });
		expect(logger.formatLogs()).toContain('INFO');
		expect(logger.formatLogs()).toContain('Published');

		logSpy.mockRestore();
	});

	it('records and clears publish time and logs', () => {
		const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const logger = new Logger();

		expect(logger.getLastPublishTime()).toBeNull();
		logger.recordPublishTime();
		expect(logger.getLastPublishTime()).toBeInstanceOf(Date);

		logger.warn('Warning');
		expect(logger.getLogs()).toHaveLength(1);
		logger.clearLogs();
		expect(logger.getLogs()).toHaveLength(0);

		logSpy.mockRestore();
	});
});
