import { InMemoryCustomerRepository } from '../src/adapters/inMemoryCustomerRepository';
import { InMemoryLedgerRepository } from '../src/adapters/inMemoryLedgerRepository';
import { InMemoryDraftRepository } from '../src/adapters/inMemoryDraftRepository';
import { RepoSet } from './contracts/support';
import { ledgerRepositoryContract } from './contracts/ledgerRepository.contract';
import { customerRepositoryContract } from './contracts/customerRepository.contract';
import { draftRepositoryContract } from './contracts/draftRepository.contract';

/** Fresh, isolated in-memory repos sharing one customer store (as in real wiring). */
async function inMemoryRepoSet(): Promise<RepoSet> {
  const customers = new InMemoryCustomerRepository();
  const ledger = new InMemoryLedgerRepository(customers);
  const drafts = new InMemoryDraftRepository();
  return { ledger, customers, drafts, cleanup: async () => {} };
}

ledgerRepositoryContract('in-memory', inMemoryRepoSet);
customerRepositoryContract('in-memory', inMemoryRepoSet);
draftRepositoryContract('in-memory', inMemoryRepoSet);
