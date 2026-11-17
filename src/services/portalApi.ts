import { IS_FIREBASE_MODE } from '../config/firebase';
import { firebasePortalService } from './firebasePortalService';
import { localPortalService } from './localPortalService';

export const portalApi = IS_FIREBASE_MODE ? firebasePortalService : localPortalService;
export const BACKEND_MODE_LABEL = IS_FIREBASE_MODE
  ? 'Firebase Cloud Functions + Firestore'
  : 'Server-Authoritative Local FIFO Engine';
