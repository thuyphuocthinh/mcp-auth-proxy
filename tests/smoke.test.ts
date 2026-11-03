import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VERSION } from '../src/index.js';

describe('Boilerplate Smoke Test', () => {
  it('should export correct version', () => {
    assert.strictEqual(VERSION, '1.0.1');
  });
});
