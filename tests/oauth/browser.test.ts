import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getOpenBrowserCommand, openBrowser } from '../../src/oauth/browser.js';

describe('OAuth Browser Opener', () => {
  const testUrl = 'https://api.200lab.io/oauth/authorize?test=1';

  it('phải tạo command chính xác cho Windows (win32)', () => {
    const cmd = getOpenBrowserCommand(testUrl, 'win32');
    assert.strictEqual(cmd, `start "" "${testUrl}"`);
  });

  it('phải tạo command chính xác cho macOS (darwin)', () => {
    const cmd = getOpenBrowserCommand(testUrl, 'darwin');
    assert.strictEqual(cmd, `open "${testUrl}"`);
  });

  it('phải tạo command chính xác cho Linux', () => {
    const cmd = getOpenBrowserCommand(testUrl, 'linux');
    assert.strictEqual(cmd, `xdg-open "${testUrl}"`);
  });

  it('openBrowser phải in đúng log hướng dẫn dự phòng ra console', async () => {
    const logs: string[] = [];
    const mockLog = (msg: string) => logs.push(msg);

    // Dùng fake URL không thực thi ảnh hưởng tới hệ thống
    await openBrowser('https://example.com/test', mockLog);

    assert.ok(logs.some((l) => l.includes('https://example.com/test')));
    assert.ok(logs.some((l) => l.includes('Nếu trình duyệt không tự mở')));
  });
});
