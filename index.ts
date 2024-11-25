import { Account } from "algosdk";
import { config } from "dotenv";

const algosdk = require("algosdk");

config();

const algodToken = "a".repeat(64);
const algodServer = "http://localhost"; // Local node URL
const algodPort = "4001";
const client = new algosdk.Algodv2(algodToken, algodServer, algodPort);

const main = async () => {
  const accountA = generateAccount();
  const accountB = generateAccount();

  await fundAccount(accountA);
  await fundAccount(accountB);

  const assetId = await createASA(accountA);
  await optInASA(accountB, assetId);
  await transferASA(accountA, accountB, assetId, 1);
  await freezeASA(accountA, accountB, assetId, true);
};

const generateAccount = () => {
  const account = algosdk.generateAccount();
  return account;
};

const fundAccount = async (account: Account) => {
  const mnemonic = process.env.MNEMONIC || "";
  const funderAccount = algosdk.mnemonicToSecretKey(mnemonic);
  const params = await client.getTransactionParams().do();

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: funderAccount.addr,
    to: account.addr,
    amount: 10e6,
    suggestedParams: params,
  });

  const signedTxn = algosdk.signTransaction(txn, funderAccount.sk);
  await client.sendRawTransaction(signedTxn.blob).do();
  console.log(`Successfully funded account: ${account.addr}`);
};

const createASA = async (account: Account) => {
  const params = await client.getTransactionParams().do();

  const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    from: account.addr,
    suggestedParams: params,
    defaultFrozen: false,
    unitName: "DIE",
    assetName: "Death",
    manager: account.addr,
    reserve: account.addr,
    freeze: account.addr,
    clawback: account.addr,
    total: 1000,
    decimals: 0,
  });

  const signedTxn = txn.signTxn(account.sk);
  await client.sendRawTransaction(signedTxn).do();
  const result = await algosdk.waitForConfirmation(
    client,
    txn.txID().toString(),
    3
  );
  console.log("Asset ID:", result["asset-index"]);
  return result["asset-index"];
};

// Opt into ASA
const optInASA = async (account: Account, assetId: number) => {
  const params = await client.getTransactionParams().do();

  const optInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: account.addr,
    to: account.addr,
    suggestedParams: params,
    assetIndex: assetId,
    amount: 0,
  });

  const signedTxn = optInTxn.signTxn(account.sk);
  const txId = optInTxn.txID().toString();
  await client.sendRawTransaction(signedTxn).do();
  await waitForConfirmation(txId);
  console.log(`${account.addr} opted into asset ${assetId}`);
};

// Transfer ASA
const transferASA = async (
  creator: Account,
  receiver: Account,
  assetId: number,
  amount: number
) => {
  const params = await client.getTransactionParams().do();

  const xferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: creator.addr,
    to: receiver.addr,
    suggestedParams: params,
    assetIndex: assetId,
    amount: amount,
  });

  const signedTxn = xferTxn.signTxn(creator.sk);
  const txId = xferTxn.txID().toString();
  await client.sendRawTransaction(signedTxn).do();
  await waitForConfirmation(txId);
  console.log(
    `Transferred ${amount} units of asset ${assetId} to ${receiver.addr}`
  );
};

// Freeze ASA in an account
const freezeASA = async (
  manager: Account,
  target: Account,
  assetId: number,
  freezeState: boolean
) => {
  const params = await client.getTransactionParams().do();

  const freezeTxn = algosdk.makeAssetFreezeTxnWithSuggestedParamsFromObject({
    from: manager.addr,
    suggestedParams: params,
    assetIndex: assetId,
    freezeState: freezeState,
    freezeTarget: target.addr,
  });

  const signedTxn = freezeTxn.signTxn(manager.sk);
  const txId = freezeTxn.txID().toString();
  await client.sendRawTransaction(signedTxn).do();
  await waitForConfirmation(txId);
  console.log(
    `${target.addr} is now ${
      freezeState ? "frozen" : "unfrozen"
    } for asset ${assetId}`
  );
};

// Wait for transaction confirmation
async function waitForConfirmation(txId) {
  let status = await client.status().do();
  let lastRound = status["last-round"];
  while (true) {
    const pendingInfo = await client.pendingTransactionInformation(txId).do();
    if (pendingInfo["confirmed-round"] && pendingInfo["confirmed-round"] > 0) {
      console.log(
        "Transaction confirmed in round",
        pendingInfo["confirmed-round"]
      );
      break;
    }
    lastRound++;
    await client.statusAfterBlock(lastRound).do();
  }
}

main().catch((e) => {
  console.error(e);
});
