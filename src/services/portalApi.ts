import { IS_FIREBASE_MODE } from '../config/firebase';
import { firebasePortalService } from './firebasePortalService';
import { localPortalService } from './localPortalService';

const currentService = IS_FIREBASE_MODE ? firebasePortalService : localPortalService;

export const portalApi = {
    ...currentService,
    async adminRemoveTeamAllocation(teamId: string, reason: string): Promise<void> {
        if ('adminRemoveTeamAllocation' in currentService && typeof (currentService as any).adminRemoveTeamAllocation === 'function') {
            return (currentService as any).adminRemoveTeamAllocation(teamId, reason);
        }
        return localPortalService.adminRemoveTeamAllocation(teamId, reason);
    },
};

export const BACKEND_MODE_LABEL = IS_FIREBASE_MODE
    ? 'Firebase Cloud Functions + Firestore'
    : 'Server-Authoritative Local FIFO Engine';