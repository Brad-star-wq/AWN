import { Ledger } from './ledger';
import { CustomerRepository, NewCustomer } from '../ports/customerRepository';
import { DraftRepository } from '../ports/draftRepository';
import { Cents, Customer, DraftProduct, ItemType, LedgerEntry } from './types';

/**
 * Intake: the counter flow.
 *
 * The owner takes in a customer's items, issues store credit for the buy-in,
 * and drops a stub draft for each item onto the pending pile to be itemized
 * later. This module ties those three steps together over the ports.
 */

export interface IntakeItem {
  itemType: ItemType;
  attributes?: Record<string, unknown>;
  priceCents?: Cents;
}

/** Either an existing customer (by id) or the details to create a new one. */
export type IntakeCustomerInput = { id: string } | NewCustomer;

export interface IntakeInput {
  customer: IntakeCustomerInput;
  /** Store credit issued for the buy-in. Must be positive integer cents. */
  creditCents: Cents;
  items: IntakeItem[];
  /** Idempotency key for the credit issue (e.g. an intake/receipt id). */
  idempotencyKey?: string;
  note?: string;
  createdBy?: string;
}

export interface IntakeDeps {
  ledger: Ledger;
  customers: CustomerRepository;
  drafts: DraftRepository;
}

export interface IntakeResult {
  customer: Customer;
  creditEntry: LedgerEntry;
  drafts: DraftProduct[];
}

/** Resolve the intake's customer: look up by id, find-or-create by phone, else create. */
async function resolveCustomer(
  input: IntakeCustomerInput,
  customers: CustomerRepository,
): Promise<Customer> {
  if ('id' in input) {
    const found = await customers.getCustomer(input.id);
    if (!found) throw new Error(`Intake for unknown customer id: ${input.id}`);
    return found;
  }
  if (input.phone) {
    const existing = await customers.findByPhone(input.phone);
    if (existing) return existing;
  }
  return customers.create(input);
}

export async function createIntake(input: IntakeInput, deps: IntakeDeps): Promise<IntakeResult> {
  const customer = await resolveCustomer(input.customer, deps.customers);

  // issueCredit rejects non-positive / non-integer amounts at the boundary.
  const creditEntry = await deps.ledger.issueCredit({
    customerId: customer.id,
    amountCents: input.creditCents,
    sourceRef: input.idempotencyKey,
    idempotencyKey: input.idempotencyKey,
    note: input.note,
    createdBy: input.createdBy,
  });

  const drafts: DraftProduct[] = [];
  for (const item of input.items) {
    drafts.push(
      await deps.drafts.create({
        sourceCustomerId: customer.id,
        itemType: item.itemType,
        attributes: item.attributes,
        priceCents: item.priceCents,
      }),
    );
  }

  return { customer, creditEntry, drafts };
}
