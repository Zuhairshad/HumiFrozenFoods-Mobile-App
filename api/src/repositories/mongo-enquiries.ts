import type { Db, ObjectId } from 'mongodb';
import type { CollectionIndexes } from '../db/indexes.js';
import type { Clock, EnquiryRepository } from '../domain/ports.js';
import type { EnquiryInput } from '../domain/types.js';

export const ENQUIRIES_COLLECTION = 'app_enquiries';

export const enquiryIndexes: CollectionIndexes = {
  collection: ENQUIRIES_COLLECTION,
  indexes: [
    { key: { createdAt: -1 }, name: 'createdAt_desc' },
    { key: { status: 1, createdAt: -1 }, name: 'status_createdAt_desc' },
  ],
};

interface EnquiryDocument {
  _id?: ObjectId;
  type: EnquiryInput['type'];
  name: string;
  email: string;
  phone?: string;
  business?: { name: string; type: string };
  message: string;
  ipHash: string;
  status: 'new';
  createdAt: Date;
}

export function createMongoEnquiryRepository(db: Db, clock: Clock): EnquiryRepository {
  const collection = db.collection<EnquiryDocument>(ENQUIRIES_COLLECTION);

  return {
    async insert(enquiry) {
      // Fields are copied one by one so nothing unvalidated can ever reach the document.
      const document: EnquiryDocument = {
        type: enquiry.type,
        name: enquiry.name,
        email: enquiry.email,
        message: enquiry.message,
        ipHash: enquiry.ipHash,
        status: 'new',
        createdAt: clock.now(),
      };
      if (enquiry.phone !== undefined) document.phone = enquiry.phone;
      if (enquiry.business !== undefined) {
        document.business = { name: enquiry.business.name, type: enquiry.business.type };
      }
      const result = await collection.insertOne(document);
      return { id: result.insertedId.toHexString() };
    },
  };
}
