import { Network, Alchemy } from "alchemy-sdk";
import Web3 from "web3";
import BigNumber from "bignumber.js";
import sqlite3 from 'sqlite3'; 
a
const settings = {
  apiKey: "", // Replace with your Alchemy API Key
  network: Network.ETH_MAINNET,
};
const alchemy = new Alchemy(settings);

// Beacon Deposit Contract address
const BDC_ADDRESS = "0x00000000219ab540356cBB839Cbe05303d7705Fa";

// Initialize Web3 with Alchemy WebSocket URL
const web3 = new Web3(new Web3.providers.WebsocketProvider(`wss://eth-mainnet.alchemyapi.io/v2/${settings.apiKey}`));

// Open a database connection
const db = new sqlite3.Database('./deposits.db');

// Function to handle incoming deposits
async function handleDeposit(transaction) {
  try {
    const receipt = await alchemy.core.getTransactionReceipt(transaction.hash);
    const block = await alchemy.core.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    // Decode logs to find deposit details
    receipt.logs.forEach(log => {
      if (log.address === BDC_ADDRESS) {
        // Decoding a deposit log
        const data = log.data;
        const topics = log.topics;

        // Extracting deposit details 
        const amount = BigNumber(data).toString(); // Adjust depending on log data format
        const sender = "0x" + topics[1].slice(26); // Extract sender address from topics

        const deposit = {
          blockNumber: receipt.blockNumber,
          blockTimestamp: new Date(timestamp * 1000).toISOString(),
          fee: BigNumber(receipt.gasUsed.toString()).multipliedBy(BigNumber(receipt.effectiveGasPrice.toString())).dividedBy(BigNumber(10).pow(18)).toFixed(18),
          hash: transaction.hash,
          senderAddress: sender,
        };

        console.log("Deposit Details:", deposit);

        // Save deposit details to the database
        saveToDatabase(deposit);
      }
    });
  } catch (error) {
    console.error("Error handling deposit:", error);
  }
}

// Function to save deposit details to the database
function saveToDatabase(deposit) {
  const { blockNumber, blockTimestamp, fee, hash, senderAddress } = deposit;
  db.run(`
    INSERT INTO deposits (blockNumber, blockTimestamp, fee, hash, senderAddress)
    VALUES (?, ?, ?, ?, ?)
  `, [blockNumber, blockTimestamp, fee, hash, senderAddress], function (err) {
    if (err) {
      console.error("Error saving deposit to database:", err.message);
    } else {
      console.log(`Deposit stored with Hash: ${hash}`);
    }
  });
}

// Subscribe to new pending transactions
web3.eth.subscribe('pendingTransactions', (error, txHash) => {
  if (error) {
    console.error("Subscription error:", error);
    return;
  }

  // Fetch the transaction details
  web3.eth.getTransaction(txHash).then(transaction => {
    if (transaction && transaction.to === BDC_ADDRESS) {
      handleDeposit(transaction);
    }
  }).catch(err => {
    console.error("Error fetching transaction:", err);
  });
});

// Clean up database connection on exit
process.on('exit', () => {
  db.close();
});
