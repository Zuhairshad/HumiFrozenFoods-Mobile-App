import type { EnquiryType } from '../domain/types.js';

/** What staff need to know an enquiry arrived. The message body is deliberately absent. */
export interface StoredEnquirySummary {
  id: string;
  type: EnquiryType;
  name: string;
  email: string;
  businessName?: string;
  createdAt: Date;
}

/** Transport for "new enquiry" alerts (email, Slack, ...). No provider is chosen yet. */
export interface EnquiryNotifier {
  notify(enquiry: StoredEnquirySummary): Promise<void>;
}

export class NoopNotifier implements EnquiryNotifier {
  notify(): Promise<void> {
    return Promise.resolve();
  }
}
