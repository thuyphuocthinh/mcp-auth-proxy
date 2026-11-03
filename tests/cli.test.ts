import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseArgs } from '../src/index.js';

describe('CLI Argument Parser', () => {
  it('should parse positional remote URL without flags', () => {
    const options = parseArgs(['https://mcp.200lab.io/mcp/learner']);

    assert.strictEqual(options.remoteUrl, 'https://mcp.200lab.io/mcp/learner');
    assert.strictEqual(options.noBrowser, false);
    assert.strictEqual(options.loginOnly, false);
    assert.strictEqual(options.help, false);
    assert.strictEqual(options.version, false);
    assert.deepStrictEqual(options.headers, {});
  });

  it('should parse --client-id flag', () => {
    const options = parseArgs(['https://api.example.com', '--client-id', 'client_id_999']);
    assert.strictEqual(options.clientId, 'client_id_999');
  });

  it('should parse single and multiple --header flags with key-value pairs', () => {
    const options = parseArgs([
      'https://api.example.com',
      '--header',
      'Authorization: Bearer static_token_123',
      '--header',
      'X-API-Key: secret_key',
      '--header',
      'User-Agent: CustomMCPClient/1.0'
    ]);

    assert.strictEqual(options.headers['Authorization'], 'Bearer static_token_123');
    assert.strictEqual(options.headers['X-API-Key'], 'secret_key');
    assert.strictEqual(options.headers['User-Agent'], 'CustomMCPClient/1.0');
  });

  it('should ignore malformed --header flags lacking colon separator', () => {
    const options = parseArgs(['https://api.example.com', '--header', 'InvalidHeaderValueWithoutColon']);
    assert.deepStrictEqual(options.headers, {});
  });

  it('should parse boolean flags accurately', () => {
    assert.strictEqual(parseArgs(['--no-browser']).noBrowser, true);
    assert.strictEqual(parseArgs(['--login-only']).loginOnly, true);
    assert.strictEqual(parseArgs(['-h']).help, true);
    assert.strictEqual(parseArgs(['--help']).help, true);
    assert.strictEqual(parseArgs(['-v']).version, true);
    assert.strictEqual(parseArgs(['--version']).version, true);
  });

  it('should handle URL placed after options', () => {
    const options = parseArgs(['--no-browser', '--client-id', 'test_id', 'https://mcp.service.io']);
    assert.strictEqual(options.remoteUrl, 'https://mcp.service.io');
    assert.strictEqual(options.clientId, 'test_id');
    assert.strictEqual(options.noBrowser, true);
  });

  it('should parse login subcommand and set command to login', () => {
    const options = parseArgs(['login', 'https://mcp.200lab.io/mcp/learner']);
    assert.strictEqual(options.command, 'login');
    assert.strictEqual(options.remoteUrl, 'https://mcp.200lab.io/mcp/learner');
  });

  it('should parse --auto-browser flag', () => {
    const options = parseArgs(['https://mcp.example.com', '--auto-browser']);
    assert.strictEqual(options.command, 'proxy');
    assert.strictEqual(options.autoBrowser, true);
  });

  it('should treat --login-only as command login', () => {
    const options = parseArgs(['https://mcp.example.com', '--login-only']);
    assert.strictEqual(options.command, 'login');
    assert.strictEqual(options.loginOnly, true);
  });
});
