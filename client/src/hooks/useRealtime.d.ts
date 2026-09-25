export interface RealtimeMessage {
    type: 'LEAD_CREATED' | 'LEAD_UPDATED' | 'CAMPAIGN_UPDATED' | 'FOLLOWUP_DUE' | 'CONNECTED';
    payload?: any;
    companyId?: string;
    timestamp: string;
}
interface UseRealtimeOptions {
    onLeadCreated?: (lead: any) => void;
    onLeadUpdated?: (lead: any) => void;
    onCampaignUpdated?: (campaign: any) => void;
    onMessage?: (msg: RealtimeMessage) => void;
}
export declare function useRealtime(options?: UseRealtimeOptions): {
    isConnected: boolean;
    lastEvent: RealtimeMessage | null;
    reconnect: () => void;
};
export {};
