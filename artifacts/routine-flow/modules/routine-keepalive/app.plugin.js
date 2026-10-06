const { withAndroidManifest } = require('expo/config-plugins');

const SERVICE_NAME = 'expo.modules.routinekeepalive.RoutineKeepaliveService';
const REQUIRED_PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
];

function addRoutineKeepaliveToManifest(manifest) {
  const permissions = manifest['uses-permission'] ?? [];

  for (const permission of REQUIRED_PERMISSIONS) {
    if (!permissions.some((entry) => entry.$?.['android:name'] === permission)) {
      permissions.push({ $: { 'android:name': permission } });
    }
  }
  manifest['uses-permission'] = permissions;

  const application = manifest.application?.[0];
  if (!application) {
    throw new Error('RoutineKeepalive could not find the Android application manifest entry.');
  }

  application.service ??= [];
  let service = application.service.find(
    (entry) => entry.$?.['android:name'] === SERVICE_NAME,
  );
  if (!service) {
    service = { $: { 'android:name': SERVICE_NAME } };
    application.service.push(service);
  }
  service.$ = {
    ...service.$,
    'android:name': SERVICE_NAME,
    'android:enabled': 'true',
    'android:exported': 'false',
    'android:stopWithTask': 'true',
    'android:foregroundServiceType': 'specialUse',
  };
  service.property ??= [];
  const subtypeName = 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE';
  let subtype = service.property.find(
    (entry) => entry.$?.['android:name'] === subtypeName,
  );
  if (!subtype) {
    subtype = { $: { 'android:name': subtypeName } };
    service.property.push(subtype);
  }
  subtype.$ = {
    ...subtype.$,
    'android:name': subtypeName,
    'android:value': 'Continue an active routine timer and spoken step sequence while the user locks the device.',
  };
  return manifest;
}

module.exports = function withRoutineKeepalive(config) {
  return withAndroidManifest(config, (nextConfig) => {
    addRoutineKeepaliveToManifest(nextConfig.modResults.manifest);
    return nextConfig;
  });
};

module.exports.addRoutineKeepaliveToManifest = addRoutineKeepaliveToManifest;
