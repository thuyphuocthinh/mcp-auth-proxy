import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getOpenBrowserCommand, openBrowser } from '../../src/oauth/browser.js';

describe('OAuth Browser Opener', () => {
  const sampleUrl = 'https://api.200lab.io/oauth/authorize?client_id=test&scope=learner#section';

  it('should generate valid start command on Windows (win32)', () => {
    const cmd = getOpenBrowserCommand(sampleUrl, 'win32');
    assert.strictEqual(cmd, `start "" "${sampleUrl}"`);
  });

  it('should generate valid open command on macOS (darwin)', () => {
    const cmd = getOpenBrowserCommand(sampleUrl, 'darwin');
    assert.strictEqual(cmd, `open "${sampleUrl}"`);
  });

  it('should generate valid xdg-open command on Linux and other POSIX platforms', () => {
    assert.strictEqual(getOpenBrowserCommand(sampleUrl, 'linux'), `xdg-open "${sampleUrl}"`);
    assert.strictEqual(getOpenBrowserCommand(sampleUrl, 'freebsd'), `xdg-open "${sampleUrl}"`);
    assert.strictEqual(getOpenBrowserCommand(sampleUrl, 'openbsd'), `xdg-open "${sampleUrl}"`);
  });

  it('should escape URLs with query parameters properly', () => {
    const complexUrl = 'https://auth.example.com/oauth/authorize?response_type=code&scope=read%20write&redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fcallback';
    const cmd = getOpenBrowserCommand(complexUrl, 'win32');
    assert.ok(cmd.startsWith('start "" "'));
    assert.ok(cmd.endsWith('"'));
    assert.ok(cmd.includes('scope=read%20write'));
  });

  it('openBrowser should log clear operational and fallback messages to provided logger', async () => {
    const loggedMessages: string[] = [];
    const mockLogger = (msg: string) => loggedMessages.push(msg);

    await openBrowser('https://example.com/test-oauth', mockLogger);

    assert.ok(loggedMessages.length >= 2);
    assert.ok(loggedMessages.some((m) => m.includes('Automatically opening default browser')));
    assert.ok(loggedMessages.some((m) => m.includes('https://example.com/test-oauth')));
    assert.ok(loggedMessages.some((m) => m.includes('If the browser does not open automatically')));
  });
});
