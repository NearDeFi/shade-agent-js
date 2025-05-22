use near_sdk::{
    env::{self},
    near, require,
    store::{IterableMap, IterableSet},
    AccountId, Gas, NearToken, PanicOnDefault, Promise,
};

mod ecdsa;
mod external;
mod utils;

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Worker {
    codehash: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub owner_id: AccountId,
    pub approved_codehashes: IterableSet<String>,
    pub worker_by_account_id: IterableMap<AccountId, Worker>,
}

#[near]
impl Contract {
    #[init]
    #[private]
    pub fn init(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            approved_codehashes: IterableSet::new(b"a"),
            worker_by_account_id: IterableMap::new(b"b"),
        }
    }

    pub fn require_owner(&mut self) {
        require!(env::predecessor_account_id() == self.owner_id);
    }

    pub fn approve_codehash(&mut self, codehash: String) {
        // !!! UPGRADE TO YOUR METHOD OF MANAGING APPROVED WORKER AGENT CODEHASHES !!!
        self.require_owner();
        self.approved_codehashes.insert(codehash);
    }

    /// will throw on client if worker agent is not registered with a codehash in self.approved_codehashes
    pub fn require_approved_codehash(&mut self) {
        let worker = self.get_worker(env::predecessor_account_id());
        require!(self.approved_codehashes.contains(&worker.codehash));
    }

    pub fn register_worker(&mut self, codehash: String) -> bool {
        // THIS IS A LOCAL DEV CONTRACT, SKIPPING ATTESTATION CHECKS

        let predecessor = env::predecessor_account_id();
        self.worker_by_account_id
            .insert(predecessor, Worker { codehash });

        true
    }

    pub fn get_signature(&mut self, payload: Vec<u8>, path: String) -> Promise {
        self.require_approved_codehash();

        ecdsa::get_sig(payload, path, 0)
    }

    // views

    pub fn get_worker(&self, account_id: AccountId) -> Worker {
        self.worker_by_account_id
            .get(&account_id)
            .expect("no worker found")
            .to_owned()
    }
}
