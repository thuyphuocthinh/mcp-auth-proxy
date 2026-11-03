import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseArgs } from '../src/index.js';

describe('CLI Argument Parser', () => {
  it('phải parse đúng remote URL và các cờ cơ bản', () => {
    const args = ['https://mcp.200lab.io/mcp/learner', '--no-browser'];
    const options = parseArgs(args);

    assert.strictEqual(options.remoteUrl, 'https://mcp.200lab.io/mcp/learner');
    assert.strictEqual(options.noBrowser, true);
    assert.strictEqual(options.help, false);
    assert.strictEqual(options.version, false);
  });

  it('phải parse đúng client-id và custom headers', () => {
    const args = [
      'https://api.example.com/mcp',
      '--client-id',
      'my_client_id_123',
      '--header',
      'Authorization: Bearer static_key_xyz',
      '--header',
      'X-Custom: Value123'
    ];
    const options = parseArgs(args);

    assert.strictEqual(options.remoteUrl, 'https://api.example.com/mcp');
    assert.strictEqual(options.clientId, 'my_client_id_123');
    assert.strictEqual(options.headers['Authorization'], 'Bearer static_key_xyz');
    assert.strictEqual(options.headers['X-Custom'], 'Value123');
  });

  it('phải nhận diện đúng cờ --help và --version', () => {
    assert.strictEqual(parseArgs(['-h']).help, true);
    assert.strictEqual(parseArgs(['--help']).help, true);
    assert.strictEqual(parseArgs(['-v']).version, true);
    assert.strictEqual(parseArgs(['--version']).version, true);
    assert.strictEqual(parseArgs(['--login-only']).loginOnly, true);
  });
});
