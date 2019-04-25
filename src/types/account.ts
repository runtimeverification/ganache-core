import { JsonRpcData, JsonRpcQuantity } from "./json-rpc";
import Address from "./address";
import { rlp, KECCAK256_RLP, KECCAK256_NULL } from "ethereumjs-util";

export default class Account {
  public address: Address;
  public balance: JsonRpcQuantity = new JsonRpcQuantity(0n);
  public privateKey: JsonRpcData;
  public nonce: JsonRpcQuantity = new JsonRpcQuantity(0n);
  public stateRoot: Buffer = KECCAK256_RLP;
  public codeHash: Buffer = KECCAK256_NULL;
  
  constructor(address: Address)
  constructor(buffer: Buffer)
  constructor(arg: Address | Buffer) {
    if (arg instanceof Address){
      this.address = arg;
    } else if (Buffer.isBuffer(arg)){
      const arr = rlp.decode(arg) as any as Buffer[];
      this.nonce = JsonRpcQuantity.from(arr[0]);
      this.balance = JsonRpcQuantity.from(arr[1]);
      this.stateRoot = arr[2];
      this.codeHash = arr[3];
    }
  }
  public serialize() {
    return rlp.encode(Buffer.from([this.nonce, this.balance, this.stateRoot, this.codeHash]));
  }
}