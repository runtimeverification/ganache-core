import Engine from "./engine";
import RequestProcessor from "./utils/request-processor";
import ProviderOptions, { getDefault as getDefaultProviderOptions } from "./options/provider-options";
import Emittery from "emittery";
import Ethereum from "./ledgers/ethereum/ledger"
import { privateToAddress } from "ethereumjs-util";
import Account from "./types/account";
import { generateMnemonic, mnemonicToSeedSync } from "bip39";
import { JsonRpcQuantity, JsonRpcData } from "./types/json-rpc";
import Address from "./types/address";
import JsonRpc from "./servers/utils/jsonrpc";
import EthereumOptions from "./ledgers/ethereum/options";

const hdkey = require("ethereumjs-wallet/hdkey");

export type ProviderOptions = ProviderOptions;

const WEI = 1000000000000000000n;

const options = Symbol("options");
const engine = Symbol("engine");
const requestProcessor = Symbol("requestProcessor");

interface Callback {
  (err?: Error, response?: JsonRpc.Response): void;
}


export default class Provider extends Emittery {
  private [options]: ProviderOptions;
  private [engine]: Engine;
  private [requestProcessor]: RequestProcessor;

  private wallet:any;
  private hdPath:string;
  constructor(providerOptions?: ProviderOptions) {
    super();
    const _providerOptions = this[options] = getDefaultProviderOptions(providerOptions);

    // set up our request processor to either use FIFO or or async request processing
    const _requestProcessor = this[requestProcessor] = new RequestProcessor(_providerOptions.asyncRequestProcessing ? 1 : 0);

    if (!_providerOptions.mnemonic) {
      // TODO: this is a default and should be configured that way
      _providerOptions.mnemonic = generateMnemonic();
    }
    this.wallet = hdkey.fromMasterSeed(mnemonicToSeedSync(_providerOptions.mnemonic, null));

    const accounts = this.initializeAccounts();
    // ethereum options' `accounts` are different than the provider options'
    // `accounts`, fix that up here:
    const ethereumOptions = _providerOptions as any as EthereumOptions;
    ethereumOptions.accounts = accounts;
    const ledger = _providerOptions.ledger || new Ethereum(ethereumOptions, _requestProcessor.resume.bind(_requestProcessor));
    this[engine] = new Engine(ledger);
  }

  // TODO: this doesn't seem like a provider-level function. Maybe we should
  // move this into the Ledger or it's Blockchain?
  private initializeAccounts(): Account[]{
    const _providerOptions = this[options];
    const etherInWei = JsonRpcQuantity.from(JsonRpcQuantity.from(_providerOptions.default_balance_ether).toBigInt() * WEI);
    let accounts: Account[];

    let givenAccounts = _providerOptions.accounts
    if (givenAccounts) {
      const l = givenAccounts.length;
      accounts = Array(l);
      for (let i = 0; i < l; i++) {
        const account = givenAccounts[i];
        accounts[i] = this.createAccount(etherInWei, JsonRpcData.from(account[1]), JsonRpcData.from(account[0]));
      }
    } else {
      const l =_providerOptions.total_accounts;
      if (l) {
        accounts = Array(l);
        const hdPath = this[options].hdPath;
        const wallet = this.wallet;

        for (let index = 0; index < l; index++) {
          const acct = wallet.derivePath(hdPath + index);
          const accountWallet = acct.getWallet();
          const address = Address.from(accountWallet.getAddress());
          const privateKey = JsonRpcData.from(accountWallet.getPrivateKey());
          accounts[index] = this.createAccount(etherInWei, privateKey, address);
        }
      } else {
        throw new Error("Cannot initialize chain: either options.accounts or options.total_accounts must be specified");
      }
    }
    return accounts;
  }
  
  // TODO: this should probable be moved as well (see `initializeAccounts` above)
  private createAccount(balance: JsonRpcQuantity, privateKey: JsonRpcData, address?: Address) {
    address = address || Address.from(privateToAddress(privateKey.toBuffer()));
  
    const account = new Account(address);
    account.privateKey = privateKey;
    account.balance = balance;
  
    return account;
  }

  public send(payload: JsonRpc.Request, callback?: Callback): void;
  public send(method: string, params?: any[]): Promise<any>;
  public send(arg1: string | JsonRpc.Request, arg2?: Callback | any[]): Promise<any> {
    let method: string;
    let params: any[];
    let response: Promise<{}>;
    const _engine = this[engine];
    const execute = _engine.execute.bind(_engine);
    if (typeof arg1 === "string") {
      method = arg1;
      params = arg2 as any[];
      response = this[requestProcessor].queue(execute, method, params).then((result => {
        // convert to JSON
        return JSON.parse(JSON.stringify(result));
      }));
    } else if (typeof arg2 === "function") {
      // handle backward compatibility with callback-style ganache-core
      const payload = arg1 as JsonRpc.Request;
      const callback = arg2 as Callback;
      method = payload.method;
      params = payload.params;

      this[requestProcessor].queue(execute, method, params).then((result) => {
        callback(null, JsonRpc.Response(
          payload.id, 
          JSON.parse(JSON.stringify(result))
        ));
      }).catch(callback);
    }
    else {
      throw new Error(
        "No callback provided to provider's send function. As of web3 1.0, provider.send " +
        "is no longer synchronous and must be passed a callback as its final argument."
      );
    }

    const _options = this[options];
    if (_options.verbose) {
      _options.logger.log(`   >  ${method}: ${JSON.stringify(params, null, 2).split("\n").join("\n   > ")}`);
    }

    return response;
  }

  /**
   * Legacy callback style API
   * @param payload JSON-RPC payload
   * @param callback callback
   */
  public sendAsync(payload: JsonRpc.Request, callback?: Callback): void {
    return this.send(payload, callback);
  }
}