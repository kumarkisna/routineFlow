import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import {
  createRunKeepaliveController,
  type AndroidRunKeepaliveBridge,
} from './runKeepaliveController';

const nativeKeepalive = requireOptionalNativeModule<AndroidRunKeepaliveBridge>('RoutineKeepalive');
const controller = createRunKeepaliveController(Platform.OS, nativeKeepalive);

export const isRunKeepaliveAvailable = controller.isAvailable;
export const startRunKeepalive = controller.start;
export const updateRunKeepalive = controller.update;
export const stopRunKeepalive = controller.stop;
