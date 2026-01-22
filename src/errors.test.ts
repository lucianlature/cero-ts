/**
 * Errors Tests
 */

import { describe, it, expect } from 'vitest';
import {
  CeroError,
  CMDxError,
  CoercionError,
  ValidationError,
  TimeoutError,
  ErrorCollection,
} from './errors.js';

describe('Errors', () => {
  describe('CeroError', () => {
    it('should create error with message', () => {
      const error = new CeroError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('CeroError');
    });

    it('should be instanceof Error', () => {
      const error = new CeroError('Test');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CeroError);
    });

    it('should have stack trace', () => {
      const error = new CeroError('With stack');

      expect(error.stack).toBeDefined();
    });
  });

  describe('CMDxError (deprecated alias)', () => {
    it('should be same as CeroError', () => {
      expect(CMDxError).toBe(CeroError);
    });

    it('should create error with message', () => {
      const error = new CMDxError('Legacy error');

      expect(error.message).toBe('Legacy error');
    });
  });

  describe('CoercionError', () => {
    it('should create error with attribute, value, and type info', () => {
      const error = new CoercionError('age', 'not a number', 'integer');

      expect(error.message).toContain('age');
      expect(error.name).toBe('CoercionError');
      expect(error.attribute).toBe('age');
      expect(error.targetType).toBe('integer');
      expect(error.value).toBe('not a number');
    });

    it('should accept custom message', () => {
      const error = new CoercionError('field', 123, 'string', 'Custom error message');

      expect(error.message).toBe('Custom error message');
    });

    it('should extend CeroError', () => {
      const error = new CoercionError('field', 'value', 'string');

      expect(error).toBeInstanceOf(CeroError);
      expect(error).toBeInstanceOf(CoercionError);
    });
  });

  describe('ValidationError', () => {
    it('should create error with attribute, value, and rule', () => {
      const error = new ValidationError('email', 'bad', 'format');

      expect(error.message).toContain('email');
      expect(error.name).toBe('ValidationError');
      expect(error.attribute).toBe('email');
      expect(error.value).toBe('bad');
      expect(error.rule).toBe('format');
    });

    it('should accept custom message', () => {
      const error = new ValidationError('field', 'value', 'rule', 'Custom validation error');

      expect(error.message).toBe('Custom validation error');
    });

    it('should extend CeroError', () => {
      const error = new ValidationError('field', 'value', 'rule');

      expect(error).toBeInstanceOf(CeroError);
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  describe('TimeoutError', () => {
    it('should create error with timeout limit', () => {
      const error = new TimeoutError(5000);

      expect(error.message).toContain('5000');
      expect(error.name).toBe('TimeoutError');
      expect(error.limit).toBe(5000);
    });

    it('should accept custom message', () => {
      const error = new TimeoutError(1000, 'Operation timed out');

      expect(error.message).toBe('Operation timed out');
    });

    it('should extend CeroError', () => {
      const error = new TimeoutError(1000);

      expect(error).toBeInstanceOf(CeroError);
      expect(error).toBeInstanceOf(TimeoutError);
    });
  });

  describe('ErrorCollection', () => {
    it('should create empty collection', () => {
      const collection = new ErrorCollection();

      expect(collection.isEmpty).toBe(true);
      expect(collection.size).toBe(0);
    });

    it('should add errors for attributes', () => {
      const collection = new ErrorCollection();

      collection.add('email', 'is invalid');
      collection.add('email', 'is too short');
      collection.add('name', 'is required');

      expect(collection.isEmpty).toBe(false);
      expect(collection.size).toBe(2); // 2 attributes with errors
    });

    it('should get errors for specific attribute', () => {
      const collection = new ErrorCollection();

      collection.add('email', 'is invalid');
      collection.add('email', 'is too short');
      collection.add('name', 'is required');

      const emailErrors = collection.get('email');

      expect(emailErrors).toHaveLength(2);
      expect(emailErrors).toContain('is invalid');
      expect(emailErrors).toContain('is too short');
    });

    it('should return empty array for non-existent attribute', () => {
      const collection = new ErrorCollection();

      collection.add('email', 'is invalid');

      expect(collection.get('name')).toEqual([]);
    });

    it('should check if attribute has errors', () => {
      const collection = new ErrorCollection();

      collection.add('email', 'is invalid');

      expect(collection.has('email')).toBe(true);
      expect(collection.has('name')).toBe(false);
    });

    it('should get all messages', () => {
      const collection = new ErrorCollection();

      collection.add('email', 'is invalid');
      collection.add('name', 'is required');

      const messages = collection.messages;

      expect(messages.email).toContain('is invalid');
      expect(messages.name).toContain('is required');
    });

    it('should get full message', () => {
      const collection = new ErrorCollection();

      collection.add('email', 'is invalid');
      collection.add('name', 'is required');

      const fullMessage = collection.fullMessage;

      expect(fullMessage).toContain('email is invalid');
      expect(fullMessage).toContain('name is required');
    });

    it('should clear all errors', () => {
      const collection = new ErrorCollection();

      collection.add('email', 'is invalid');
      collection.add('name', 'is required');

      expect(collection.isEmpty).toBe(false);

      collection.clear();

      expect(collection.isEmpty).toBe(true);
      expect(collection.size).toBe(0);
    });

    it('should be iterable', () => {
      const collection = new ErrorCollection();

      collection.add('email', 'is invalid');
      collection.add('name', 'is required');

      const entries: [string, string[]][] = [];
      for (const entry of collection) {
        entries.push(entry);
      }

      expect(entries.length).toBe(2);
    });
  });
});
