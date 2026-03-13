import { hashPassword, comparePassword, generateToken, verifyToken } from '../utils/auth';

describe('Authentication Utilities', () => {
  describe('Password Hashing', () => {
    it('should hash password securely', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash).toBeTruthy();
    });

    it('should correctly compare password with hash', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      const isMatch = await comparePassword(password, hash);
      expect(isMatch).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword';
      const hash = await hashPassword(password);

      const isMatch = await comparePassword(wrongPassword, hash);
      expect(isMatch).toBe(false);
    });
  });

  describe('JWT Tokens', () => {
    it('should generate valid JWT token', () => {
      const payload = {
        userId: 'test-id',
        email: 'test@example.com',
        role: 'manager',
      };

      const token = generateToken(payload);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });

    it('should verify and decode JWT token', () => {
      const payload = {
        userId: 'test-id',
        email: 'test@example.com',
        role: 'manager',
      };

      const token = generateToken(payload);
      const decoded = verifyToken(token);

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => verifyToken(invalidToken)).toThrow();
    });

    it('should throw error for tampered token', () => {
      const payload = {
        userId: 'test-id',
        email: 'test@example.com',
        role: 'manager',
      };

      const token = generateToken(payload);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';

      expect(() => verifyToken(tamperedToken)).toThrow();
    });
  });
});
