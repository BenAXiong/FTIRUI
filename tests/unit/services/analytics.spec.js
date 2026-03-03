import { beforeEach, describe, expect, it, vi } from 'vitest';

const posthogMock = {
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn()
};

describe('analytics service', () => {
  beforeEach(async () => {
    vi.resetModules();
    posthogMock.capture.mockReset();
    posthogMock.identify.mockReset();
    posthogMock.reset.mockReset();
    window.posthog = posthogMock;
    document.body.innerHTML = '';
    document.body.dataset.userAuthenticated = 'false';
    document.body.dataset.workspacePlan = 'free';
    document.body.dataset.workspaceBillingStatus = 'inactive';
    document.body.dataset.workspaceTabEnabled = 'true';
    document.body.dataset.dashboardV2 = 'true';
    document.body.dataset.posthogEnabled = 'true';
    document.body.dataset.posthogPublicKey = 'phc_test_key';
    document.body.dataset.posthogHost = 'https://us.i.posthog.com';
    window.history.replaceState({}, '', '/?canvas=abc123');
    window.sessionStorage.clear();
  });

  it('initializes PostHog from body dataset config', async () => {
    const analytics = await import('../../../apps/ftirui/ft/static/ft/js/services/analytics.js');

    expect(analytics.initAnalytics()).toBe(true);
  });

  it('captures base properties without leaking undefined values', async () => {
    const analytics = await import('../../../apps/ftirui/ft/static/ft/js/services/analytics.js');
    analytics.initAnalytics();

    analytics.captureEvent('route_resolved', {
      entry_surface: 'dashboard',
      has_canvas_id: true
    });

    expect(posthogMock.capture).toHaveBeenCalledWith(
      'route_resolved',
      expect.objectContaining({
        path: '/?canvas=abc123',
        auth_state: 'guest',
        workspace_plan: 'free',
        billing_status: 'inactive',
        workspace_tab_enabled: true,
        entry_surface: 'dashboard',
        has_canvas_id: true
      })
    );
  });

  it('stores and consumes pending provider and canvas open state', async () => {
    const analytics = await import('../../../apps/ftirui/ft/static/ft/js/services/analytics.js');

    analytics.stashPendingLoginProvider('google');
    analytics.stashPendingCanvasOpenSource('dashboard');

    expect(analytics.consumePendingLoginProvider()).toBe('google');
    expect(analytics.consumePendingLoginProvider()).toBe('');
    expect(analytics.consumePendingCanvasOpenSource()).toBe('dashboard');
    expect(analytics.consumePendingCanvasOpenSource()).toBe('');
  });
});
