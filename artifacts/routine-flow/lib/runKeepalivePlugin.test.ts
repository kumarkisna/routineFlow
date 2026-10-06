import assert from 'node:assert/strict';
import test from 'node:test';

const { addRoutineKeepaliveToManifest } = require('../modules/routine-keepalive/app.plugin.js') as {
  addRoutineKeepaliveToManifest: (manifest: Record<string, unknown>) => Record<string, unknown>;
};

type ManifestEntry = {
  $: Record<string, string>;
  property?: ManifestEntry[];
};

type PluginManifest = Record<string, unknown> & {
  'uses-permission'?: ManifestEntry[];
  application?: Array<{ service?: ManifestEntry[] }>;
};

test('the Android plugin declares an ongoing foreground service and required permissions', () => {
  const manifest: PluginManifest = {
    'uses-permission': [{ $: { 'android:name': 'android.permission.INTERNET' } }],
    application: [{ service: [{ $: { 'android:name': '.OtherService' } }] }],
  };

  addRoutineKeepaliveToManifest(manifest);

  const permissions = manifest['uses-permission'] ?? [];
  for (const permission of [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.WAKE_LOCK',
  ]) {
    assert.ok(permissions.some((entry) => entry.$['android:name'] === permission));
  }

  const services = manifest.application?.[0].service ?? [];
  const service = services.find(
    (entry) => entry.$['android:name'] === 'expo.modules.routinekeepalive.RoutineKeepaliveService',
  );
  assert.ok(service);
  assert.equal(service.$['android:foregroundServiceType'], 'specialUse');
  assert.equal(service.$['android:stopWithTask'], 'true');
  assert.ok(service.property?.some(
    (entry) => entry.$['android:name'] === 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
  ));
});

test('applying the plugin repeatedly does not duplicate its permission, service, or subtype', () => {
  const manifest: PluginManifest = { application: [{}] };

  addRoutineKeepaliveToManifest(manifest);
  addRoutineKeepaliveToManifest(manifest);

  const permissions = manifest['uses-permission'] ?? [];
  assert.equal(
    permissions.filter((entry) => entry.$['android:name'] === 'android.permission.WAKE_LOCK').length,
    1,
  );
  const services = manifest.application?.[0].service ?? [];
  assert.equal(
    services.filter((entry) => entry.$['android:name'] === 'expo.modules.routinekeepalive.RoutineKeepaliveService').length,
    1,
  );
  assert.equal(services.find(
    (entry) => entry.$['android:name'] === 'expo.modules.routinekeepalive.RoutineKeepaliveService',
  )?.property?.length, 1);
});
