import { sanitizeOutput, truncateOutput } from '../../src/security/sanitize';

describe('Sanitize & Truncate Utility', () => {
  describe('truncateOutput', () => {
    it('should return untouched text when within limit', () => {
      const text = 'Hello Sandbox World';
      const result = truncateOutput(text, 100);
      expect(result.content).toBe(text);
      expect(result.truncated).toBe(false);
    });

    it('should truncate text cleanly when exceeding maxBytes', () => {
      const text = 'A'.repeat(200);
      const result = truncateOutput(text, 50);
      expect(Buffer.from(result.content).length).toBe(50);
      expect(result.truncated).toBe(true);
    });

    it('should handle empty string safely', () => {
      const result = truncateOutput('');
      expect(result.content).toBe('');
      expect(result.truncated).toBe(false);
    });
  });

  describe('sanitizeOutput', () => {
    it('should mask host home directories', () => {
      const raw = 'Error at /home/ubuntu/project/apps/api/server.ts:42';
      const sanitized = sanitizeOutput(raw);
      expect(sanitized).not.toContain('/home/ubuntu');
      expect(sanitized).toContain('/sandbox');
    });

    it('should mask host root and Users directories', () => {
      const raw = 'Failed to write to /root/secret.txt and /Users/finn/code';
      const sanitized = sanitizeOutput(raw);
      expect(sanitized).not.toContain('/root');
      expect(sanitized).not.toContain('/Users/finn');
    });

    it('should mask 64-char container IDs', () => {
      const id = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const raw = `Container ${id} stopped abnormally`;
      const sanitized = sanitizeOutput(raw);
      expect(sanitized).not.toContain(id);
      expect(sanitized).toContain('[CONTAINER_ID]');
    });

    it('should handle empty or null string gracefully', () => {
      expect(sanitizeOutput('')).toBe('');
    });
  });
});
