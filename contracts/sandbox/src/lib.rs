use hex::{decode, encode};
use near_sdk::{
    env::{self, block_timestamp},
    log, near, require,
    store::{IterableMap, IterableSet},
    AccountId, Gas, NearToken, PanicOnDefault, Promise,
};

use dcap_qvl::{verify, QuoteCollateralV3};

mod collateral;
mod ecdsa;
mod external;
mod utils;

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Worker {
    checksum: String,
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

    // helpers for method access control

    pub fn require_owner(&mut self) {
        require!(env::predecessor_account_id() == self.owner_id);
    }

    pub fn require_worker(&self, codehash: String) {
        let worker = self
            .worker_by_account_id
            .get(&env::predecessor_account_id())
            .unwrap()
            .to_owned();

        require!(worker.codehash == codehash);
    }

    // examples for method access control

    /// will throw on client if caller is not verified for the provided codehash
    pub fn is_verified_by_codehash(&mut self, codehash: String) {
        self.require_worker(codehash);

        // worker agent does something amazing here
        log!("The agent abides.")
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

    /// will throw on client if worker agent is not registered with a codehash in self.approved_codehashes
    pub fn is_verified_by_approved_codehash(&mut self) {
        let worker = self.get_worker(env::predecessor_account_id());

        require!(self.approved_codehashes.contains(&worker.codehash));

        // worker agent does something amazing here
        log!("The agent abides.")
    }

    // register args see: https://github.com/mattlockyer/based-agent-template/blob/main/pages/api/register.js

    pub fn register_worker(
        &mut self,
        quote_hex: String,
        collateral: String,
        checksum: String,
        tcb_info: String,
    ) -> bool {
        let collateral = collateral::get_collateral(collateral);
        let quote = decode(quote_hex).unwrap();
        let now = block_timestamp() / 1000000000;
        let result = verify::verify(&quote, &collateral, now).expect("report is not verified");
        let rtmr3 = encode(result.report.as_td10().unwrap().rt_mr3.to_vec());
        let codehash = collateral::verify_codehash(tcb_info, rtmr3);

        // uncomment this line to only allow workers to register if their codehash arg is approved
        // require!(self.approved_codehashes.contains(&codehash));

        let predecessor = env::predecessor_account_id();
        self.worker_by_account_id
            .insert(predecessor, Worker { checksum, codehash });

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
